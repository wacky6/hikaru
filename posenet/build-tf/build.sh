#!/bin/bash

set -e

TF_DIR=$( ls -d tensorflow-* )
BUILD_OPTS="\
  --config opt \
  --config monolithic \
  --compilation_mode opt \
  --config noaws \
  --config nogcp \
  --config nohdfs \
  --config noignite \
  --config nonccl \
"

# build
# echo "n" to disable Apache Ignite, havn't find env var switch yet
( cd $TF_DIR;
  ./configure;
  bazel build $BUILD_OPTS //tensorflow/tools/lib_package:libtensorflow
)

# TODO: test

# cp to dest
cp $TF_DIR/bazel-out/k8-opt/bin/tensorflow/libtensorflow.so /output/
