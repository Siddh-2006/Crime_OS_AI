from importlib import import_module

try:
    ORTModelForSequenceClassification = import_module(
        "optimum.onnxruntime"
    ).ORTModelForSequenceClassification
except ImportError as exc:
    raise ImportError(
        "Install the 'optimum' package with ONNX Runtime support: "
        "pip install optimum[onnxruntime] onnxruntime"
    ) from exc

try:
    AutoTokenizer = import_module("transformers").AutoTokenizer
except ImportError as exc:
    raise ImportError(
        "Install the 'transformers' package: pip install transformers"
    ) from exc

model_name = "BAAI/bge-reranker-v2-m3"

model = ORTModelForSequenceClassification.from_pretrained(
    model_name,
    export=True
)

tokenizer = AutoTokenizer.from_pretrained(model_name)

model.save_pretrained("./onnx_reranker")
tokenizer.save_pretrained("./onnx_reranker")