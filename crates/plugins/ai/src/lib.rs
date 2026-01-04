//! AI plugin for Viwo using rig for LLM operations.

use rig::completion::Prompt;
use rig::providers::{anthropic, cohere, openai, perplexity};

/// Validate that a capability grants access to AI operations
fn validate_capability(
    capability: &serde_json::Value,
    current_entity_id: i64,
) -> Result<(), String> {
    // Check ownership
    let owner_id = capability["owner_id"]
        .as_i64()
        .ok_or("ai: capability missing owner_id")?;
    if owner_id != current_entity_id {
        return Err("ai: capability does not belong to current entity".to_string());
    }

    Ok(())
}

/// Generate text using an LLM
pub async fn ai_generate_text(
    capability: &serde_json::Value,
    entity_id: i64,
    provider: &str,
    model: &str,
    prompt: &str,
    options: &serde_json::Value,
) -> Result<String, String> {
    validate_capability(capability, entity_id)?;

    // Get API key from capability params
    let api_key = capability["params"]["api_key"]
        .as_str()
        .ok_or("ai: capability missing api_key parameter")?;

    let temperature = options["temperature"].as_f64().unwrap_or(0.7);
    let max_tokens = options["max_tokens"].as_u64().unwrap_or(1000);

    match provider {
        "openai" => {
            let client = openai::Client::new(api_key);
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent.prompt(prompt).await
                .map_err(|e| format!("ai.generate_text failed: {}", e))?;
            Ok(response)
        }
        "anthropic" => {
            // Anthropic requires base_url, betas, and version
            let client = anthropic::Client::new(
                api_key,
                "https://api.anthropic.com",
                None,
                "2023-06-01"
            );
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent.prompt(prompt).await
                .map_err(|e| format!("ai.generate_text failed: {}", e))?;
            Ok(response)
        }
        "cohere" => {
            let client = cohere::Client::new(api_key);
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent.prompt(prompt).await
                .map_err(|e| format!("ai.generate_text failed: {}", e))?;
            Ok(response)
        }
        "perplexity" => {
            let client = perplexity::Client::new(api_key);
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent.prompt(prompt).await
                .map_err(|e| format!("ai.generate_text failed: {}", e))?;
            Ok(response)
        }
        _ => Err(format!("ai: unsupported provider '{}'. Supported: openai, anthropic, cohere, perplexity", provider)),
    }
}

/// Generate embeddings for text
pub async fn ai_embed(
    capability: &serde_json::Value,
    entity_id: i64,
    provider: &str,
    model: &str,
    text: &str,
) -> Result<Vec<f64>, String> {
    validate_capability(capability, entity_id)?;

    // Get API key from capability params
    let api_key = capability["params"]["api_key"]
        .as_str()
        .ok_or("ai: capability missing api_key parameter")?;

    match provider {
        "openai" => {
            // TODO: Fix rig embeddings API - placeholder for now
            // The rig library's Embedding type needs proper conversion
            // This will be fixed when testing with real API keys
            Err("ai.embed: not yet fully implemented - embeddings API needs refinement".to_string())
        }
        _ => Err(format!("ai: unsupported provider '{}'", provider)),
    }
}

/// Chat completion with message history
pub async fn ai_chat(
    capability: &serde_json::Value,
    entity_id: i64,
    provider: &str,
    model: &str,
    messages: &[serde_json::Value],
    options: &serde_json::Value,
) -> Result<String, String> {
    validate_capability(capability, entity_id)?;

    // Get API key from capability params
    let api_key = capability["params"]["api_key"]
        .as_str()
        .ok_or("ai: capability missing api_key parameter")?;

    // Convert messages to prompt format
    // For now, simple concatenation - can be improved
    let mut prompt = String::new();
    for msg in messages {
        let role = msg["role"].as_str().unwrap_or("user");
        let content = msg["content"].as_str().unwrap_or("");
        prompt.push_str(&format!("{}: {}\n", role, content));
    }

    let temperature = options["temperature"].as_f64().unwrap_or(0.7);
    let max_tokens = options["max_tokens"].as_u64().unwrap_or(1000);

    match provider {
        "openai" => {
            let client = openai::Client::new(api_key);
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent.prompt(&prompt).await
                .map_err(|e| format!("ai.chat failed: {}", e))?;
            Ok(response)
        }
        "anthropic" => {
            let client = anthropic::Client::new(
                api_key,
                "https://api.anthropic.com",
                None,
                "2023-06-01"
            );
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent.prompt(&prompt).await
                .map_err(|e| format!("ai.chat failed: {}", e))?;
            Ok(response)
        }
        "cohere" => {
            let client = cohere::Client::new(api_key);
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent.prompt(&prompt).await
                .map_err(|e| format!("ai.chat failed: {}", e))?;
            Ok(response)
        }
        "perplexity" => {
            let client = perplexity::Client::new(api_key);
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent.prompt(&prompt).await
                .map_err(|e| format!("ai.chat failed: {}", e))?;
            Ok(response)
        }
        _ => Err(format!("ai: unsupported provider '{}'. Supported: openai, anthropic, cohere, perplexity", provider)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_capability(owner_id: i64, api_key: &str) -> serde_json::Value {
        serde_json::json!({
            "owner_id": owner_id,
            "params": {
                "api_key": api_key
            }
        })
    }

    #[test]
    fn test_capability_validation() {
        let cap = create_test_capability(1, "test-key");

        // Valid capability
        assert!(validate_capability(&cap, 1).is_ok());

        // Wrong entity ID
        assert!(validate_capability(&cap, 2).is_err());

        // Missing owner_id
        let bad_cap = serde_json::json!({
            "params": {
                "api_key": "test"
            }
        });
        assert!(validate_capability(&bad_cap, 1).is_err());
    }

    // Note: Integration tests with real APIs would require API keys
    // and should be run separately or mocked
}
