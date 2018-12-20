hikaru
===
Bilibili Live 录制姬 🌟 Never miss a single Bili-Live again! 

    あなたはわたしの光

![hikaru](./icon.png)

## Docker 用法 
```shell
docker pull wacky6/hikaru
docker run -v <local_dir>:/root/hikaru/ wacky6/hikaru <command> [args...]
```

可以在指令后追加 `--help` 选项查看帮助

## 直播录制/通知 - daemon
```shell
hikaru daemon <room_id>   # 房间号（短号、长号均可）
```

捕捉直播视频，保存到 `~/hikaru/` 文件夹，文件名为：`<up昵称>_<日期>_<捕捉开始时间戳>.flv`

### Telegram 通知

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


## 弹幕监控 / 超级弹幕姬 - dmk
```shell
hikaru dmk [-R] <room_id...>   # 房间号（短号、长号均可）
```

捕捉房间内弹幕，需配合 `--dump` 或 `--publish` 或 `--log-path` 选项指定记录方式。 

使用 `-R` 选项激活刷屏弹幕过滤（例如，节奏风暴、小电视），推荐使用。

使用 `-r <n>` 选项增加冗余度（多连接 `<n>` 个弹幕服务器），范围0-3，默认1。可降低因小破站服务器繁忙而丢失弹幕的可能性。

* mongodb 输出 - `--dump` \
  可使用 `--db` 选项设置 mongodb 数据库。\
  默认 `mongodb://localhost/hikaru`
* AMQP / RabbitMQ 输出 - `--publish` \
  可使用 `--publish-url` 和 `--publish-name` 指定 AMQP 服务节点 和 Topic。\
  默认 `amqp://localhost/` 和 `hikaru.danmaku`
* 日志 - `--log-path` \
  激活日志输出并设置日志路径，可使用 `@roomid` 占位符代表 房间号（长号）。\
  例如： `--log-path /root/hikaru/dmk-@roomid.log`


## LICENSE
GPL-3.0
