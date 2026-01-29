FROM docker.io/rust:1.92 as builder

WORKDIR /usr/src/handles-web
COPY Cargo.toml .
COPY Cargo.lock .
COPY src ./src
RUN cargo install --path .

FROM docker.io/debian:stable-slim
RUN apt-get update && apt-get upgrade && apt-get install -y ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/local/cargo/bin/handles-web /usr/local/bin/handles-web
EXPOSE 9090
CMD ["handles-web"]