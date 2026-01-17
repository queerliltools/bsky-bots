use hyper::{
    Body, Request, Response, Server, StatusCode, header::CONTENT_TYPE, service::{make_service_fn, service_fn}
};
use std::convert::Infallible;

mod atproto {
    use serde::Deserialize;

    #[derive(Deserialize)]
    pub struct AtProtoResponse {
        pub value: Option<AtProtoValue>,
    }

    #[derive(Deserialize)]
    pub struct AtProtoValue {
        pub href: Option<String>,
    }
}

const BASE_URI: &'static str = "https://at.queerlil.tools/xrpc";
const REPO: &'static str = "did:plc:4vrriezpgc4t6y5sf7lcilhv";

async fn handle(req: Request<Body>) -> Result<Response<Body>, Infallible> {
    let client = reqwest::Client::new();
    let host_header = match req.headers().get("host") {
        Some(h) => h,
        None => return Ok(error("unknown", "unknown", StatusCode::BAD_REQUEST, "Missing Host header".to_string()))
    };
    let host = match host_header.to_str() {
        Ok(h) => h,
        Err(_) => return Ok(error("unknown", "unknown", StatusCode::BAD_REQUEST, "Invalid Host header".to_string()))
    };
    let rev_host = host.split('.').rev().collect::<Vec<_>>().join(".");
    let path = req.uri().path().trim_start_matches('/');
    let file_name = if !path.is_empty() {
        path.split('/').last().unwrap_or("index.html").split('.').next().unwrap_or("index")
    } else { "index" };
    let rkey = format!("{}.{}", rev_host, file_name);
    let atproto_url = format!(
        "{}/com.atproto.repo.getRecord?repo={}&collection=tools.queerlil.handles.page&rkey={}",
        &BASE_URI, urlencoding::encode(REPO), urlencoding::encode(&rkey)
    );

    let record_resp = match client.get(&atproto_url).send().await {
        Ok(r) => r,
        Err(_) => return Ok(error(host, file_name, StatusCode::NOT_FOUND, format!("Failed to fetch record for rkey: {}", rkey)))
    };

    let record_json: atproto::AtProtoResponse = match record_resp.json().await {
        Ok(j) => j,
        Err(_) => return Ok(error(host, file_name, StatusCode::NOT_FOUND, format!("Failed to parse JSON for rkey: {}", rkey)))
    };

    let href = match record_json.value.and_then(|v| v.href) {
        Some(h) => h,
        None => return Ok(error(host, file_name, StatusCode::NOT_FOUND, format!("No href found for rkey: {}", rkey)))
    };

    let page_resp = match client.get(&href).send().await {
        Ok(r) => r,
        Err(_) => return Ok(error(host, file_name, StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to fetch page from href: {}", href)))
    };

    let body = match page_resp.text().await {
        Ok(t) => t,
        Err(_) => return Ok(error(host, file_name, StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read page text from href: {}", href)))
    };

    let mut resp = Response::new(Body::from(body));
    resp.headers_mut().insert(CONTENT_TYPE, "text/html; charset=utf-8".parse().unwrap());

    println!("[{}] {}/{}: Served page from href: {}", StatusCode::OK, host, file_name, href.split("https://gist.githubusercontent.com/").last().unwrap_or(&href));
    Ok(resp)
}

fn error(host: &str, file_name: &str, status_code: StatusCode, msg: String) -> Response<Body> {
    let mut resp = Response::new(Body::from("Not found"));
    *resp.status_mut() = status_code;
    eprintln!("{}/{} [{}]: {}", host, file_name, status_code, msg);
    resp
}

#[tokio::main]
async fn main() {
    let addr = ([0, 0, 0, 0], 9090).into();

    let make_svc = make_service_fn(|_| async {
        Ok::<_, Infallible>(service_fn(handle))
    });

    println!("Listening on http://{}", addr);
    Server::bind(&addr).serve(make_svc).await.unwrap();
}
