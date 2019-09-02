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

# TODO: should request docker upstream to support COPY exclusion
COPY bin /hikaru/bin
COPY handlers /hikaru/handlers
COPY lib /hikaru/lib
COPY modular-support.js LICENSE README.md /hikaru/

ENTRYPOINT ["/hikaru/bin/hikaru"]
