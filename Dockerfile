FROM node:alpine
LABEL maintainer="Jiewei Qian <qjw@wacky.one>"

ENV HIKARU_DEFAULT_AMQP="amqp://rabbitmq/"
ENV HIKARU_DEFAULT_MONGO="mongodb://mongo/hikaru"
ENV TZ="Asia/Shanghai"

USER root
WORKDIR /root/

COPY package.json yarn.lock /hikaru/
RUN mkdir -p /root/hikaru/ && \
    apk add --no-cache curl ffmpeg tzdata && \
    cp /usr/share/zoneinfo/${TZ} /etc/localtime && \
    echo ${TZ} > /etc/timezone && \
    apk del tzdata && \
    ( cd /hikaru/ ; yarn install )
COPY . /hikaru/

ENTRYPOINT ["/hikaru/bin/hikaru"]
