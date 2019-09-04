# posenet/build-tf

Dockerfile to build locally optimized libtensorflow.so for tfjs-node

## Usage:
```shell
docker build . -t build-tf -f Dockerfile.cpu
docker run -v <local-dir>:/output/ build-tf    # run this on target host
```

Built libtensorflow.so will be copied to `<local-dir>`

## Docker ENV
Alternatively, run with `-e CC_OPT_FLAGS='-march=native'` and set target's march flags.

For GCC toolchain, run `gcc -march=native -E -v - </dev/null 2>&1 | grep cc` to get machine's optimization flags.

These flags can be passed to `CC_OPT_FLAGS` and allow building for another target. This is useful when target's computation resource is limited, and you have a different machine with lots of CPU cores.