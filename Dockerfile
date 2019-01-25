FROM node:alpine
LABEL maintainer="Jiewei Qian <qjw@wacky.one>"

ENV HIKARU_DEFAULT_AMQP="amqp://rabbitmq/"
ENV HIKARU_DEFAULT_MONGO="mongodb://mongo/hikaru"

USER root
WORKDIR /root/

COPY package.json yarn.lock /hikaru/
RUN mkdir -p /root/hikaru/ && \
    apk add --no-cache curl ffmpeg && \
    ( cd /hikaru/ ; yarn install )
COPY . /hikaru/

ENTRYPOINT ["/hikaru/bin/hikaru"]
