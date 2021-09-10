#!/bin/bash

PROJECT="hikaru"
BRANCH=""

if [ ! -z $CIRCLE_BRANCH ] ; then
  BRANCH=$CIRCLE_BRANCH
  echo "CI build for: $BRANCH"
else
  BRANCH=$( git rev-parse --abbrev-ref HEAD )
  echo "Local build for: $BRANCH"
fi

LITE_TAG=""
FULL_TAG=""

if [ $BRANCH == master ] || [ $BRANCH == main ] ; then
  LITE_TAG='lite'
  FULL_TAG='full'
else
  LITE_TAG="${BRANCH}-lite"
fi

echo "Building..."

if [ ! -z $LITE_TAG ] ; then
  docker build . -t $PROJECT:$LITE_TAG -f Dockerfile.lite
fi

if [ ! -z $FULL_TAG ] ; then
  docker build . -t $PROJECT:$FULL_TAG -f Dockerfile.full
fi

echo $GHCR_USER
echo $GHCR_TOKEN

if [ -z $GHCR_USER ] || [ -z $GHCR_TOKEN ] ; then
  echo "Registry user and token isn't specified, skip publish."
  exit 0
else
  echo "Publishing to ghcr..."
  echo $GHCR_TOKEN | docker login ghcr.io -u $GHCR_USER --password-stdin

  if [ ! -z $LITE_TAG ] ; then
    docker tag $PROJECT:$LITE_TAG ghcr.io/$GHCR_USER/$PROJECT:$LITE_TAG
    docker push ghcr.io/$GHCR_USER/$PROJECT:$LITE_TAG
  fi

  if [ $LITE_TAG == lite ] ; then
    # On master / main, update the latest (default) tag
    docker tag $PROJECT:$LITE_TAG ghcr.io/$GHCR_USER/$PROJECT:latest
    docker push ghcr.io/$GHCR_USER/$PROJECT:latest
  fi

  if [ ! -z $FULL_TAG ] ; then
    docker tag $PROJECT:$FULL_TAG ghcr.io/$GHCR_USER/$PROJECT:$FULL_TAG
    docker push ghcr.io/$GHCR_USER/$PROJECT:$FULL_TAG
  fi
fi
