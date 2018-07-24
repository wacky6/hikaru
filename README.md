hikaru
===
Never miss a single Bili-Live again! 🌟

![hikaru](./icon.png)

## Docker Usage
```shell
docker pull wacky6/hikaru
docker run -v <local_dir>:/root/hikaru/ wacky6/hikaru daemon <room_id>
```

## Usage
* must be macOS or Linux.
* curl is a hard dependency, it must be located in `$PATH`

```shell
hikaru run <room_id>      # capture live
hikaru daemon <room_id>   # make idol shine!
```

## Telegram Notification
When running `hikaru daemon`, you can configure a telegram bot to send notifications.

![Notification Screenshot](./notification.png)

1. Use [@BotFather](https://telegram.me/BotFather) to create your bot, write down the `token` (eg: `123456:abcdef-xyz`)
2. Chat with the bot you created (send `/start` command)
3. Use [@userinfobot](https://telegram.me/userinfobot) to get your `telegram_id`
4. Run daemon with `-t` option: `hikaru daemon <room_id> -t <token>:<telegram_id>`

## LICENSE
GPL-3.0
