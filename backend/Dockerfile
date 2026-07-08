FROM rust:1.95 AS builder

WORKDIR /app
COPY . .
RUN cargo build --release --bin backend

FROM debian:bookworm-slim AS runtime

WORKDIR /app
COPY --from=builder /app/target/release/backend /usr/local/bin/backend

EXPOSE 8080
CMD ["backend"]
