# handles-web

A lightweight asynchronous web server built with Rust that resolves custom domain handles to HTML content stored in ATProto (Bluesky protocol) records. It acts as a bridge between domain-based requests and decentralized content hosted via ATProto APIs.

## Features

- **Asynchronous HTTP Server**: Uses Hyper to handle incoming requests on port 9090, supporting concurrent connections via Tokio.
- **ATProto Integration**: Fetches records from a specific ATProto repository using the `com.atproto.repo.getRecord` endpoint.
- **Dynamic Content Resolution**: Reverses the domain for rkey construction and serves content from external sources like GitHub Gists.
- **Error Handling**: Graceful error responses for missing hosts or fetch failures.
- **Logging**: Prints success and error logs for monitoring.

## Installation

### Prerequisites

- Rust toolchain installed (via [rustup](https://rustup.rs/))
- Internet access for fetching dependencies and runtime requests

### Build

1. Clone or navigate to the project directory.
2. Run `cargo build` for debug build or `cargo build --release` for optimized release.

The binary will be located at `target/debug/handles-web` or `target/release/handles-web`.

## Usage

1. Run the server: `cargo run` or execute the built binary.
2. The server starts on `http://0.0.0.0:9090`.
3. Send HTTP requests with a `Host` header matching expected domains.

### Example

```bash
curl -H "Host: example.com" http://localhost:9090/path/to/file
```

This will resolve `example.com` to a reversed rkey, fetch the corresponding ATProto record, and serve the content.

Stop the server with Ctrl+C.

## Dependencies

- `hyper` (v0.14): HTTP server and client.
- `tokio` (v1): Asynchronous runtime.
- `reqwest` (v0.11): HTTP client for ATProto requests.
- `serde` (v1): JSON deserialization.
- `serde_json` (v1): JSON parsing.
- `urlencoding` (v2.1.3): URL encoding.
- `once_cell` (v1.19): Lazy initialization (currently unused).

## Configuration

Settings like the ATProto repository and base URI are hardcoded in the source. For customization, modify `src/main.rs`.

## Contributing

Contributions are welcome. Please submit issues or pull requests on the project's repository.

## License

TODO!!!