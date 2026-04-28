use std::env;
use std::fs;
use std::process;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_PORT: u16 = 17532;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();

    if args.is_empty() || args[0] == "--help" || args[0] == "-h" {
        print_usage();
        return;
    }
    if args[0] == "--version" || args[0] == "-V" {
        println!("shoulders-cli {VERSION}");
        return;
    }
    if args[0] == "--list" {
        run_or_exit(list_tools);
        return;
    }

    let tool = &args[0];

    if args.len() > 1 && (args[1] == "--help" || args[1] == "-h") {
        run_or_exit(|url, token| show_tool_help(url, token, tool));
        return;
    }

    let compact = args.iter().any(|a| a == "--json");
    let input = parse_tool_args(&args[1..]);

    let (url, token) = discover_or_exit();

    match call_tool(&url, &token, tool, &input) {
        Ok(result) => {
            let output = if compact || !is_tty() {
                serde_json::to_string(&result).unwrap()
            } else {
                serde_json::to_string_pretty(&result).unwrap()
            };
            println!("{output}");
        }
        Err(e) => {
            eprintln!("Error: {e}");
            process::exit(1);
        }
    }
}

fn discover_or_exit() -> (String, String) {
    discover_server().unwrap_or_else(|e| {
        eprintln!("Error: {e}");
        process::exit(1);
    })
}

fn run_or_exit(f: impl FnOnce(&str, &str)) {
    let (url, token) = discover_or_exit();
    f(&url, &token);
}

fn discover_server() -> Result<(String, String), String> {
    if let (Ok(url), Ok(token)) = (
        env::var("SHOULDERS_TOOL_SERVER_URL"),
        env::var("SHOULDERS_TOOL_SERVER_TOKEN"),
    ) {
        return Ok((url, token));
    }

    let mut dir = env::current_dir().map_err(|e| e.to_string())?;
    loop {
        let token_path = dir.join(".shoulders/tool-server-token");
        if token_path.exists() {
            let token = fs::read_to_string(&token_path)
                .map_err(|e| e.to_string())?
                .trim()
                .to_string();
            let port_path = dir.join(".shoulders/tool-server-port");
            let port = fs::read_to_string(port_path)
                .ok()
                .and_then(|s| s.trim().parse::<u16>().ok())
                .unwrap_or(DEFAULT_PORT);
            return Ok((format!("http://localhost:{port}"), token));
        }
        if !dir.pop() {
            break;
        }
    }

    Err("No workspace found. Run from a directory with .shoulders/".to_string())
}

fn http_post(url: &str, token: &str, body: &serde_json::Value) -> Result<serde_json::Value, String> {
    let body_str = serde_json::to_string(body).map_err(|e| e.to_string())?;
    let resp = ureq::post(url)
        .header("Authorization", &format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .send(body_str.as_bytes())
        .map_err(map_connection_error)?;
    let bytes = resp.into_body().read_to_vec().map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

fn http_get(url: &str, token: &str) -> Result<serde_json::Value, String> {
    let resp = ureq::get(url)
        .header("Authorization", &format!("Bearer {token}"))
        .call()
        .map_err(map_connection_error)?;
    let bytes = resp.into_body().read_to_vec().map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

fn map_connection_error(e: ureq::Error) -> String {
    if matches!(e, ureq::Error::ConnectionFailed) {
        "Shoulders is not running. Start the app first.".to_string()
    } else {
        e.to_string()
    }
}

fn call_tool(
    url: &str,
    token: &str,
    tool: &str,
    input: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({ "tool": tool, "input": input });
    let result = http_post(&format!("{url}/api/tools/call"), token, &body)?;

    if result.get("error").is_some() {
        let msg = result
            .get("message")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Unknown error");
        return Err(msg.to_string());
    }

    Ok(result
        .get("result")
        .cloned()
        .unwrap_or(serde_json::Value::Null))
}

fn list_tools(url: &str, token: &str) {
    let tools = fetch_tools(url, token);

    if tools.is_empty() {
        println!("No tools available.");
        return;
    }

    let mut current_category = String::new();
    for tool in &tools {
        let cat = tool
            .get("category")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Other");
        if cat != current_category {
            if !current_category.is_empty() {
                println!();
            }
            println!("  {cat}");
            current_category = cat.to_string();
        }
        let name = tool
            .get("name")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("?");
        let desc = tool
            .get("description")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("");
        let desc_short = if desc.len() > 60 {
            format!("{}...", &desc[..57])
        } else {
            desc.to_string()
        };
        println!("    {:<24} {desc_short}", name);
    }
}

fn show_tool_help(url: &str, token: &str, tool_name: &str) {
    let tools = fetch_tools(url, token);

    let tool = tools
        .iter()
        .find(|t| t.get("name").and_then(serde_json::Value::as_str) == Some(tool_name));

    let Some(tool) = tool else {
        eprintln!("Error: Unknown tool \"{tool_name}\".");
        eprintln!("Run `shoulders --list` to see available tools.");
        process::exit(1);
    };

    let desc = tool
        .get("description")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    println!("shoulders {tool_name} — {desc}");
    println!();

    let schema = tool.get("input_schema");
    let props = schema
        .and_then(|s| s.get("properties"))
        .and_then(serde_json::Value::as_object);
    let required_arr = schema
        .and_then(|s| s.get("required"))
        .and_then(serde_json::Value::as_array);
    let required: Vec<&str> = required_arr
        .map(|arr| arr.iter().filter_map(serde_json::Value::as_str).collect())
        .unwrap_or_default();

    if let Some(props) = props {
        println!("PARAMETERS:");
        for (name, prop_schema) in props {
            let typ = prop_schema
                .get("type")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("any");
            let req = if required.contains(&name.as_str()) {
                "required"
            } else {
                "optional"
            };
            let param_desc = prop_schema
                .get("description")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            println!("    --{:<20} ({typ}, {req})", name);
            if !param_desc.is_empty() {
                println!("      {param_desc}");
            }
        }
        println!();
        println!("EXAMPLE:");
        let example_args: Vec<String> = props
            .iter()
            .filter(|(name, _)| required.contains(&name.as_str()))
            .map(|(name, ps)| {
                let placeholder = match ps.get("type").and_then(serde_json::Value::as_str) {
                    Some("number") => "0",
                    Some("boolean") => "true",
                    _ => "\"...\"",
                };
                format!("--{name} {placeholder}")
            })
            .collect();
        println!("    shoulders {tool_name} {}", example_args.join(" "));
    } else {
        println!("  No parameters.");
    }
}

fn fetch_tools(url: &str, token: &str) -> Vec<serde_json::Value> {
    let body = match http_get(&format!("{url}/api/tools"), token) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("Error: {e}");
            process::exit(1);
        }
    };
    body.get("tools")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn parse_tool_args(args: &[String]) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--json" {
            i += 1;
            continue;
        }
        if let Some(key) = args[i].strip_prefix("--") {
            if i + 1 < args.len() && !args[i + 1].starts_with("--") {
                let val = &args[i + 1];
                let parsed: serde_json::Value =
                    serde_json::from_str(val).unwrap_or(serde_json::Value::String(val.clone()));
                map.insert(key.to_string(), parsed);
                i += 2;
            } else {
                map.insert(key.to_string(), serde_json::Value::Bool(true));
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    serde_json::Value::Object(map)
}

fn is_tty() -> bool {
    #[cfg(unix)]
    {
        unsafe { libc::isatty(1) != 0 }
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn print_usage() {
    println!(
        "shoulders-cli {VERSION} — Shoulders workspace tool client

USAGE:
    shoulders <tool> [--param value ...]
    shoulders --list
    shoulders <tool> --help

OPTIONS:
    --list          List available tools
    --json          Force compact JSON output
    --version       Show version
    --help          Show this help

EXAMPLES:
    shoulders search_references --query \"attention mechanisms\"
    shoulders read_file --path \"paper.docx\"
    shoulders cite_reference --key smith2024
    shoulders web_search --query \"transformer architectures\"

DISCOVERY:
    The CLI finds the running Shoulders app by looking for
    .shoulders/tool-server-token in the current directory or
    any parent. Set SHOULDERS_TOOL_SERVER_URL and
    SHOULDERS_TOOL_SERVER_TOKEN to override."
    );
}
