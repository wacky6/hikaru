#!/usr/bin/env python3
import argparse
import numpy as np
from sklearn import linear_model
from scipy.signal import medfilt
from scipy.interpolate import interp1d
from math import floor
import scipy.ndimage.morphology as morphology
from sys import exit
import os
import traceback

def find_mode(Y, t):
    return linear_model.HuberRegressor().fit(t.reshape(-1, 1), Y).intercept_

def smooth(Y, wnd):
    smoothY = medfilt(Y, wnd)
    return smoothY, Y

def sec_to_time_repr(sec):
    h = sec // 3600
    m = sec // 60 % 60
    s = sec % 60
    return '%d:%02d:%02d' % (h,m,s)

def plot_yc(ax1, y, y2, c, c2, t, mode_y, thresh_y, ylabel = ''):
    ax1.set_ylabel(ylabel)
    ax1.plot(t, y, linewidth=1, color=[0.7, 0.7, 1])
    ax1.plot(t, y2, linewidth=2, color='b')
    ax1.set_ylim(-0.3*y.max(), y2.max() * 1.2)
    ax1.set_xlim(0, t.max())
    ax1.axhline(y=mode_y, color=[1, 0.5, 0.5], linewidth=1)
    ax1.axhline(y=thresh_y, color='r', linewidth=2)

    ax2 = ax1.twinx()
    ax2.set_ylim(0, 5)
    ax2.fill_between(t, c2, linewidth=2, color=[0.6, 1, 0.6])
    ax2.plot(t, c, linewidth=1, color='g')

def plot_c(ax1, c, c2, t, mode_c, thresh_c, clabel = ''):
    ax1.set_ylabel(clabel)
    ax1.fill_between(t, c2, linewidth=2, color=[0.6, 1, 0.6])
    ax1.plot(t, c, linewidth=1, color='g')
    ax1.set_ylim(0, c.max() * 1.1)
    ax1.set_xlim(0, t.max())
    if mode_c:
        ax1.axhline(y=mode_c, color=[1, 0.5, 0.5], linewidth=1)
    if thresh_c:
        ax1.axhline(y=thresh_c, color='r', linewidth=2)

def compute_volatility(a, window = 0.85):
    a = np.sort(a)
    n_drop = min(3, round(len(a) * (1-window) / 2))

    # compute relative deviation of `window` portion of samples
    a = a[n_drop: len(a)-n_drop]
    return np.std(a) / np.mean(a)

def seg_pose(csvpath, dump):
    THRESHOLD_EYE = 0.8
    THRESHOLD_EAR = 0.8
    THRESHOLD_SHOULDER = 0.75
    THRESHOLD_HIP = 0.2
    THRESHOLD_KNEE = 0.1
    MIN_SEGMENT_LENGTH = 30
    EXPAND_SEGMENT_LENGTH = 9
    MED_WND = 9
    MAX_SEGMENTS_PER_HOUR = 8

    # read csv
    df = dict()
    with open(csvpath) as f:
        columns = f.readline().split(',')
        for col in columns:
            df[col] = []
        for line in f:
            for idx, val in enumerate(line.split(',')):
                df[columns[idx]].append(float(val))
        for col in columns:
            df[col] = np.array(df[col])

    t = df['pts']

    if len(t) <= 10:
        print(f'Too few body pose samples, ignored. {csvpath}', file=sys.stderr)
        exit(0)

    intra_frame_interval = np.diff(t).mean()

    print((
        f'        frames: {len(t)}\n'
        f'      duration: {sec_to_time_repr(t.max())}\n'
        f'frame interval: {round(intra_frame_interval, 3)}/s'
    ), file=sys.stderr)

    # eye width
    eye2, eye = smooth(np.abs(df['leftEyeX'] - df['rightEyeX']), MED_WND)
    eye_c2, eye_c = smooth((df['leftEye'] + df['rightEye']) / 2, MED_WND)
    mode_eye = find_mode(eye, t)

    # ear width
    ear2, ear = smooth(np.abs(df['leftEarX'] - df['rightEarX']), MED_WND)
    ear_c2, ear_c = smooth((df['leftEar'] + df['rightEar']) / 2, MED_WND)
    mode_ear = find_mode(ear, t)

    # shoulder width
    sld2, sld = smooth(np.abs(df['leftShoulderX'] - df['rightShoulderX']), MED_WND)
    sld_c2, sld_c = smooth((df['leftShoulder'] + df['rightShoulder']) / 2, MED_WND)
    mode_sld = find_mode(sld, t)

    # knee detection confidence
    knee_c2, knee_c = smooth((df['leftKnee'] + df['rightKnee']) / 2, MED_WND)
    mode_knee_c = find_mode(knee_c, t)

    # hip detection confidence
    hip_c2, hip_c = smooth((df['leftHip'] + df['rightHip']) / 2, MED_WND)
    mode_hip_c = find_mode(hip_c, t)

    # score
    decision_eye = mode_eye * THRESHOLD_EYE
    decision_ear = mode_ear * THRESHOLD_EAR
    decision_sld = mode_sld * THRESHOLD_SHOULDER,
    decision_hip = (1-mode_hip_c) * THRESHOLD_HIP + mode_hip_c
    decision_knee = (1-mode_knee_c) * THRESHOLD_KNEE + mode_knee_c

    weight = np.array([
        [0.25],
        [0.35],
        [0.4],
        [0.5],
        [1]
    ])
    feat_score = [
        eye2 < decision_eye,
        ear2 < decision_ear,
        sld2 < decision_sld,
        hip_c2 > decision_hip,
        knee_c2 > decision_knee,
    ]
    score = np.sum(np.multiply(weight, feat_score), axis=0)

    # make decision
    segment_frames = int(round(MIN_SEGMENT_LENGTH / intra_frame_interval))
    expand_frames = int(round(EXPAND_SEGMENT_LENGTH / intra_frame_interval))
    expand_struct = [True] * expand_frames
    filter_struct = [True] * segment_frames

    decision = score > 0.8
    decision = morphology.binary_closing(decision, filter_struct)
    decision = morphology.binary_opening(decision, filter_struct)
    decision = morphology.binary_dilation(decision, expand_struct)

    # scan through decision score, build segment list
    segments = []
    ignored_segments = []
    cur_start = None

    for i in range(decision.shape[0]):
        # mark start position
        if not cur_start and decision[i]:
            cur_start = t[i], i

        # mark end position, do extra checks
        if cur_start and not decision[i]:
            # check duration is reasonable
            # check segment is constructed with sufficient samples
            # detection in samples are dynamic (e.g. not from a static photo)

            start_t, start_i = cur_start
            end_t, end_i = t[i], i
            duration = end_t - start_t

            cur_start = None    # unmark start position for next iteration

            n_actual_samples = end_i - start_i
            n_expected_samples = floor((end_t - start_t) / intra_frame_interval) + 1
            sample_ratio = n_actual_samples / n_expected_samples

            volatility = np.mean([
                compute_volatility(eye[start_i:end_i+1]),
                compute_volatility(ear[start_i:end_i+1]),
                compute_volatility(sld[start_i:end_i+1]),
            ])

            if duration > 600:
                # most likely misdetection
                # a typical dance should not last more than 10 minutes
                print(f'Ignore segment {round(start_t, 3)} to {round(end_t, 3)}: too long duration, time = {round(duration)} secs', file=sys.stderr)
                ignored_segments.append((start_t, end_t, 'too long', 'T'))
                continue

            if sample_ratio < 0.3:
                # most likely static image
                print(f'Ignore segment {round(start_t, 3)} to {round(end_t, 3)}: too few valid samples, ratio = {round(sample_ratio, 2)}', file=sys.stderr)
                ignored_segments.append((start_t, end_t, 'valid samples', 'S'))
                continue

            if volatility < 0.08:
                print(f'Ignore segment {round(start_t, 3)} to {round(end_t, 3)}, too small volatility, r_vol = {volatility.round(5)}', file=sys.stderr)
                ignored_segments.append((start_t, end_t, 'volatility', 'V'))
                continue

            segments.append((start_t, end_t))

    if len(segments) > (np.max(t) - np.min(t)) / 3600 * MAX_SEGMENTS_PER_HOUR:
        print(f'Too many segments, possibly wrong type. {csvpath}', file=sys.stderr)
        print(f'Ignoring all segments for automatic extraction.', file=sys.stderr)
        for start_t, end_t in segments:
            print(f'    {{"start_t": {round(start_t, 3)}, "end_t": {round(end_t, 3)}}}', file=sys.stderr)
        segments = []

    for start_t, end_t in segments:
        print(f'{{"start_t": {round(start_t, 3)}, "end_t": {round(end_t, 3)}}}')

    if dump:
        try:
            import matplotlib
            matplotlib.use('Agg')
            matplotlib.rcParams.update({'font.size': 18})

            import matplotlib.pyplot as plt

            fig, ax = plt.subplots(6, 1, figsize=(36,24), sharex=True)
            fig.suptitle(os.path.basename(csvpath))

            f_eye = plot_yc(ax[0], eye, eye2, eye_c, eye_c2, t, mode_eye, decision_eye, 'eye')
            f_ear = plot_yc(ax[1], ear, ear2, ear_c, ear_c2, t, mode_ear, decision_ear, 'ear')
            f_sld = plot_yc(ax[2], sld, sld2, sld_c, sld_c2, t, mode_sld, decision_sld, 'shoulder')
            f_hip = plot_c(ax[3], hip_c, hip_c2, t, mode_hip_c, decision_hip, 'hip')
            f_knee = plot_c(ax[4], knee_c, knee_c2, t, mode_knee_c, decision_knee, 'knee')
            f_decision = plot_c(ax[5], score, decision * score.max() * 1.1, t, None, None, 'decision')

            for start_t, end_t, reason, code in ignored_segments:
                m_time = (end_t + start_t) / 2
                ax[5].text(m_time, 1.55, code,
                    horizontalalignment='center',
                    verticalalignment='bottom',
                    color='red',
                    fontsize=26
                )
                ax[5].fill_between([start_t, end_t], 0, 1.5, color=[1, 0.6, 0.6])

            labels = [sec_to_time_repr(t) for t in ax[5].get_xticks()]
            ax[5].set_xticklabels(labels)
            ax[5].tick_params(axis='x', length=8, width=2, colors='black')
            fig.tight_layout()

            if not dump.endswith('.png'):
                png_path = dump + '.png'
            else:
                png_path = dump

            fig.savefig(png_path, dpi=144, optimize=True, facecolor='w', format='png')
        except:
            print(f'Fail to dump analysis diagram, error:', file=sys.stderr)
            print(traceback.format_exc(), file=sys.stderr)
            try:
                trace_path = dump + '.png'
                with open(trace_path, 'w') as f:
                    print(f'Fail to dump analysis diagram, error:', file=f)
                    print(traceback.format_exc(), file=f)
            except:
                print(f'Fail to write dump trace, error:', file=sys.stderr)
                print(traceback.format_exc(), file=sys.stderr)


parser = argparse.ArgumentParser(
    usage = '%(prog)s [-d dump] <csv>',
    description = 'determine segment boundaries from pose csv'
)
parser.add_argument(
    'csv',
    type = str,
    help = 'pose csv, use - for stdin'
)

parser.add_argument(
    '-d', '--dump',
    type = str,
    default = '',
    help = 'dump segmentation analysis diagram to file'
)

if __name__ == "__main__":
    args = parser.parse_args()
    seg_pose(args.csv, args.dump)



