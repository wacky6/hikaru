#!/usr/bin/env python3

import numpy as np
import cv2 as cv
import json
import sys
import subprocess
import os
import av

prototxt = 'ssd_face/deploy.prototxt'
model = 'ssd_face/res10_300x300_ssd_iter_140000.caffemodel'

#####
# POC: dance
# 1. face and eye detection, find out the most prominent face
#    check each face rect contains eye rects
# 2. track face rect size.
#    assumption: when dancing, idol is far away, so the face rect should be smaller and more volatile
# 3. should interpolate missing data points
# 4. plot and mark time slice

def poc_dance_stage1(path, wnd_size = 300):
    container = av.open(path)
    video_stream = container.streams.get(video=0)[0]
    video_stream.codec_context.skip_frame = 'NONKEY'
    net = cv.dnn.readNetFromCaffe(prototxt, model)

    print('T,CONFIDENCE,X,Y,W,H,DIAGONAL,DET')
    last_param = [0,0,0,0,0,0]

    start_time = float(video_stream.start_time * video_stream.time_base)
    for frame in container.decode(video_stream):
        rgb = frame.to_ndarray(format='bgr24')
        time = frame.time - start_time

        (h, w) = rgb.shape[:2]
        blob = cv.dnn.blobFromImage(
            rgb,
            1,
            (wnd_size, wnd_size),
            (0,0,0),
        )

        net.setInput(blob)
        detections = net.forward()

        candidates = []

        for i in range(0, detections.shape[2]):
            confidence = detections[0, 0, i, 2]

            if confidence < 0.5:
                continue

            box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
            (l,t,r,b) = box.astype('int')

            diag = int(round( ((r-l)**2 + (b-t)**2)**0.5 ) )
            candidates.append((confidence, l, t, r-l, b-t, diag))

            text = "{:.2f}%".format(confidence * 100)
            cv.rectangle(rgb, (l,t), (r,b), (0,255,0), 2)
            cv.putText(rgb, text, (l,t), cv.FONT_HERSHEY_SIMPLEX, 0.45, (0,255,0), 2)

        candidates = sorted(candidates, key = lambda c: c[5], reverse=True)

        if len(candidates) > 0:
            print(f'{time},{",".join(map(str, candidates[0]))},1')
            last_param = candidates[0]
        else:
            print(f'{time},{",".join(map(str, last_param))},1')

        # cv.imshow('img', rgb)

        # k = cv.waitKey(100) & 0xff
        # if k == 27:
        #     break

    # cv.destroyAllWindows()

# start as main
if __name__ == "__main__":
    poc_dance_stage1(sys.argv[1])
