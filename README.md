<p align="center">
    <img width="360" height="350" src="https://raw.githubusercontent.com/wacky6/hikaru/master/icon.png"></img>
    <h1 align="center">hikaru</h1>
    <blockquote align="center">此时此刻，你也一定，光辉耀目<br> / 君は私の光〜</blockquote>
</p>

* [Docker 用法](#docker-用法)
* [直播监听 / 录屏](#直播监听---daemon)
  * [开播通知](#telegram-开播通知)
* [弹幕监听 / 超级弹幕姬](#弹幕监听--超级弹幕姬---dmk)
* [身体姿势分析](#身体姿势分析---pose)
* [热点片段截取](#热点片段截取---extract)
* [自动上传](#自动上传-minio---uplink)
* [示例（Docker）](#示例-docker环境)
* [性能优化（针对Docker）](#性能优化)

---

## Docker 用法
提供两个版本的镜像tag，请按照需求选择：

`wacky6/hikaru:lite` 仅提供**基础录屏**功能（仅daemon和dmk），镜像大小 ~120MB \
`wacky6/hikaru:full` 提供完整功能（包括自动提取），镜像大小 ~1.2GB

```shell
docker pull wacky6/hikaru:<tag>
docker run -v <local_dir>:/root/hikaru/ wacky6/hikaru <command> [args...]
```

在指令后追加 `--help` 选项查看帮助，参见[Docker示例](#示例-docker环境)

## 直播监听 - daemon
```shell
hikaru daemon <room_id>   # 房间号（短号、长号均可）
```

捕捉直播视频，默认保存到 `~/hikaru/` ，文件名：`<up昵称>__<日期>_<捕捉开始时间>.flv`。\
时区为 中国标准时间 (CST / UTC+8)。

* `-C` / `--no-capture`：配合 Telegram 通知使用。只发通知，不录制。 ~~（那个 up 不够重要）~~
* `-f` / `--format`：指定录播文件格式，支持： `mp4` / `mkv`。
* `-i` / `--interval`：开播状态查询间隔，单位为秒。默认`60s`。过快可能导致被封禁

### Telegram 开播通知

![Notification Screenshot](./notification.png)

开播时投递 Telegram 消息。向 daemon 指令后追加以下两个参数：
```shell
-T https://api.telegram.org/    # 可选，Telegram API地址，绕墙
-t <tg_token>:<chat_id>    # Telegram Bot Token 和 聊天 ID，消息投送到目标聊天
```

个人使用示例：
1. 用 [@BotFather](https://telegram.me/BotFather) 创建 Bot， 记下 `token` (例如 `123456:abcdef-xyz`)
2. 搜索刚创建到 Bot， 和它聊天，并发送 `/start` 指令激活它
3. 用 [@userinfobot](https://telegram.me/userinfobot) 获取自己的 `telegram_id`，用来创建和 Bot 的私人聊天
4. 用 `-t` 选项和上面记下的信息开启通知: `hikaru daemon <room_id> -t <token>:<telegram_id>`


## 弹幕监听 / 超级弹幕姬 - dmk
```shell
hikaru dmk [-R] <room_id...>   # 房间号（短号、长号均可）
```

捕捉房间内弹幕，需配合 `--dump` 或 `--publish` 或 `--log-path` 选项指定记录方式。

* `-R` / `--raffle-filter`：开启刷屏弹幕过滤（例如，节奏风暴、小电视），推荐使用。
* `-r` / `--redundancy <n>`：设置冗余度（多连接 `<n>` 个弹幕服务器），范围0-3，默认1。\
  可减少因小破站服务器繁忙而丢失弹幕的可能性 （未严格验证，依然有可能有丢弹幕）
* `-b` / `--publish-broadcast`：推送广播弹幕（如，广播抽奖，小时榜），与 `--publish` 选项使用
* `-p` / `--publish`：推送到 AMQP / RabbitMQ，用于构建复杂的实时应用 （比如抽奖、排行榜） \
  使用 `--publish-url` 和 `--publish-name` 指定 AMQP 服务器节点 和 Topic。\
  默认 `amqp://localhost/` 和 `hikaru.danmaku`
* `-l` / `--log-path <path>`：输出日志，用于离线分析 ~~（数据收集怪）~~ \
  启用日志输出，设置日志路径。使用 `@roomid` 表示 房间号（长号）。\
  例如： `--log-path /root/hikaru/dmk-@roomid.log`

## 身体姿势分析 - pose
```shell
hikaru pose <input>
```

分析身体姿势（Pose）并输出结果。输出可用于自动截取视频热点片段（~~白瞟姬~~）。

* `<input>`：`-` 表示 stdin；或者是文件路径
* `-o` / `--output <out>`：输出文件，`-` 表示 stdout；或者是文件路径 \
  对stdin输入，默认stdout \
  对文件输入，默认文件所在目录下 `.pose/` 文件夹的同名文件，扩展名取决于 `--format` 选项
* `-f` / `--format <csv|ndjson>`：输出格式；\
  csv 只输出最显著身体姿态的可信度和位置 \
  ndjson 输出所有检测到的身体姿态
* `-c` / `--center-crop`：只分析影像的中心部分（正方形中心区域），如果主体位于视频中心位置能加快处理速度
* `-m` / `--multiplier <0.5|0.75|1.0|1.01>`：PoseNet 卷基层倍数；小 -> 快速，大 -> 精确
* `-r` / `--resolution <193|257|353|449|513>`：PoseNet 输入分辨率；小 -> 快速，大 -> 精确
* `-s` / `--stride <8|16|32>`：PoseNet 条带；小 -> 精确，大 -> 快速


## 热点片段截取 - extract
```shell
hikaru extract <media> -t <type>
```

分析视频内容，截取热点片段（~~白瞟姬~~）。

* `<media>`：已保存的直播视频
* `-t` / `--type <T>`：指定热点类型，目前支持：
  - `dance`：舞区（视频聊天 - 舞见），截取跳舞的片段，基于 Pose 分析
* `-X`：指定提取过程的参数
* `-A`：指定分析过程的参数

更多选项用 `hikaru extract --help` 查看。

## 自动上传 Minio - uplink
```shell
hikaru uplink -f [mtime_within] -e [extensions] -O <outdir> <minio_endpoint>
```

实现自动上传/自助获取录播，详见 [uplink/README.md](uplink/README.md)。


## 示例 （Docker环境）
```shell
### 基础录屏
# 录制 922045 房间
# 保存录像到 `/storage/hikaru/焦小玲珑`
# 绕墙发送开播通知，有弹出框
docker run \
  --restart=always -itd \
  --name hikaru-922045 \
  -v /storage/hikaru/焦小玲珑:/root/hikaru \
  wacky6/hikaru:lite daemon 922045 \
  -t 03108991:ABCDEFGHIJKLMN:19950418 \
  -T https://tg-api.example.com/
```

```shell
### 基础弹幕捕获
# 监听 922045、697773 房间的弹幕
# 每房间一个冗余的弹幕姬
# 推送弹幕到 AMQP，推送广播弹幕，开启刷屏弹幕过滤
# 保留原始弹幕日志到 `/storage/hikaru/dmk`
docker run \
  --restart=always -itd \
  --name hikaru-dmk-r1 \
  -v /storage/hikaru/dmk:/data \
  wacky6/hikaru:lite dmk \
  -r 1 \
  -pbR \
  -l '/data/dmk-@roomid.log' \
  922045 697773
```

```shell
### 录屏并自动提取
# 录制并自动提取 424902 房间的跳舞片段
# 保存录像到 `/storage/hikaru/424902`
# 提取mp4片段到 `/cache/extracted`，保留分析结果和分段详情
# 用 -r 选项打开实时分析，在下播后数分钟内即可全部提取
docker run \
  --restart=always -itd \
  --name hikaru-dance-424902 \
  -v /storage/hikaru/424902:/root/hikaru \
  -v /cache/extracted:/root/hikaru/extracted \
  wacky6/hikaru:full daemon 424902 \
  -r \
  -x dance -X '-p -d -f mp4'
```

```shell
### 从已有录屏提取
# 提取 /storage/焦小玲珑/2018-09-04_180519.flv 录屏
# 提取跳舞片段为 mp4 到 /cache/extracted-922045
# 保留姿态分析结果，给出分段详情 PNG
# 使用本机优化编译的 /root/libtensorflow.native
docker run \
  --rm \
  -v /storage:/storage \
  -v /cache:/cache \
  -v /root/libtensorflow.native:/lib/libtensorflow.so
  wacky6/hikaru:full extract \
  -f mp4 \
  -pd \
  -O '/cache/extracted-922045' \
  '/storage/焦小玲珑/2018-09-04_180519.flv'
```


## 性能优化
根据 [posenet/build-tf](https://github.com/wacky6/hikaru/tree/master/posenet/build-tf) 中的指令构建优化后的tensorflow运行时，然后用Docker的`-v`/`--mount`指令挂载输出的libtensorflow.so到容器的`/lib/libtensorflow.so`

默认参数下，AMD X3621获得 ~30% 提升，i7 6700HQ获得 ~50% 提升。


## LICENSE
GPL-3.0
