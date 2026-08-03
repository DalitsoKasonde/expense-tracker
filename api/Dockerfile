FROM golang:1.25-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/api ./cmd/api
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/adminctl ./cmd/adminctl

FROM alpine:3.20
RUN apk add --no-cache ca-certificates postgresql-client
WORKDIR /app

COPY --from=build /out/api ./api
COPY --from=build /out/adminctl ./adminctl
COPY migrations ./migrations

EXPOSE 8080
ENTRYPOINT ["./api"]
