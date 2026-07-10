FROM rust:1.95-bookworm AS builder

WORKDIR /app
COPY Cargo.toml Cargo.toml
COPY crates crates

RUN cargo build --release --workspace --all-features

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/api-server /usr/local/bin/api-server

EXPOSE 6090
CMD ["api-server"]
