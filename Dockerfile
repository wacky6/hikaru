FROM node:alpine
LABEL maintainer="Jiewei Qian <qjw@wacky.one>"

ENV HIKARU_DEFAULT_AMQP="amqp://rabbitmq/"
ENV HIKARU_DEFAULT_MONGO="mongodb://mongo/hikaru"

USER root
WORKDIR /root/

ADD . /hikaru/
RUN mkdir -p /root/hikaru/ && \
    apk add --no-cache curl && \
    ( cd /hikaru/ ; yarn install )

ENTRYPOINT ["/hikaru/bin/hikaru"]