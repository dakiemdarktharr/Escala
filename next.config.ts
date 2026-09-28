import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  outputFileTracingIncludes: { "/api/*": ["./data/demo/*.json", "./data/models/english/config.json", "./data/models/english/export.json", "./data/models/english/tokenizer*.json", "./data/models/english/onnx/model.onnx"] },
  outputFileTracingExcludes: { "/api/*": ["./data/models/english/source/**/*", "./.venv-ml/**/*", "./.local/**/*", "./data/sentiment/**/*"] },
};

export default config;
