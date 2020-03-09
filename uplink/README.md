hikaru-uplink
===

A helper script to upload latest captures to a [minio](https://github.com/minio/minio) server.

## Recommended Setup
- A working minio server reachable by the host running this script
- Setup minio bucket, reachable at `https://oss-pub.example.com/`
- Setup bucket (object) lifecycle, so you don't blow up server's storage capacity
    1. Create a lifecycle configuration `lifecycle.json` (i.e. auto-delete files after 10 days)

            {
                "Rules": [
                    {
                        "Expiration": {
                            "Days": 10
                        },
                        "ID": "Auto expiry",
                        "Filter": {
                            "Prefix": ""
                        },
                        "Status": "Enabled"
                    }
                ]
            }

    2. Use [aws-cli](https://aws.amazon.com/cli/) to upload lifecycle configuration \

            export AWS_ACCESS_KEY_ID=<MINIO_ACCESS_KEY>
            export AWS_SECRET_ACCESS_KEY=<MINIO_SECRET_KEY>
            aws s3api put-bucket-lifecycle-configuration --bucket your-bucket --endpoint-url https://oss-pub.example.com/ --lifecycle-configuration file://lifecycle.json

    3. Expose the bucket to users (i.e. nginx autoindex)
- Setup a crontab with your preferred interval

        docker run --rm \
            -e ACCESS_KEY=<ACCESS_KEY> \
            -e ACCESS_SECRET=<ACCESS_SECRET> \
            -v <HIKARU_OUT_DIR>:/data \
            hikaru \
            uplink -f 1d -e mp4 \ -O /data https://oss-pub.example.com

      This will upload files with mp4 extension, and are modified within 1 day, on Docker host's `<HIKARU_OUT_DIR>` to `https://oss-pub.example.com`, using `ACCESS_KEY` and `ACCESS_SECRET` respectively.

## How it works
When `hikaru-uplink` is run, it scans `<target>` directory and uploads files to the specified `<oss-endpoint>`.

The files can be optionally filtered with modification time (`[freshness]`) and extension names (`[ext]`).

### Freshness / `-f`
Files whose modification time is within the duration will be uploaded.

Accepts time duration, examples:

|     | Meaning        |
|-----|----------------|
| 1d  | 1 day / 24 hrs |
| 12h | 12 hrs         |
| 1w  | 1 week         |

### Extension / `-e`
Files whose extension matches the provided list will be uploaded.

Accepts comma saperated extension list, for example: `mp4,mkv`.


### Output Dir / `-O`
Specify the directory to scan. This will apply Freshness and Extension filtering.

### Output File / `-o`
Upload a single file, ignoring Freshness and Extension filtering.


### LICENSE
GPL-3.0
