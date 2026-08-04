import torch
import traceback
from PIL import Image
from transformers import AutoModelForCausalLM, AutoProcessor

# Bypass the strict check_imports that crashes on missing flash_attn
import transformers.dynamic_module_utils as _dmu
_dmu.check_imports = lambda filename: []

import transformers.utils.import_utils as _tiu
_tiu.is_flash_attn_2_available = lambda: False
_tiu.is_flash_attn_greater_or_equal_2_10 = lambda: False

MODEL_ID = "microsoft/Florence-2-base"

def run_test():
    print("Loading Florence-2 model...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
        trust_remote_code=True,
    ).to(device)
    
    processor = AutoProcessor.from_pretrained(MODEL_ID, trust_remote_code=True)
    
    print("Model loaded. Loading image...")
    image = Image.open(r"D:\CRIME_OS_AI\WhatsApp Image 2026-07-28 at 22.14.25.jpeg").convert("RGB")
    
    print("Running processor...")
    inputs = processor(
        text="<MORE_DETAILED_CAPTION>",
        images=image,
        return_tensors="pt",
    ).to(device)

    print("Running generate()...")
    with torch.no_grad():
        generated_ids = model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=512,
            early_stopping=False,
            do_sample=False,
            num_beams=3,
        )
    
    print("Decoding...")
    try:
        generated_text = processor.batch_decode(
            generated_ids, skip_special_tokens=False
        )[0]
    except AttributeError:
        # Fallback if processor doesn't have batch_decode
        generated_text = processor.tokenizer.batch_decode(
            generated_ids, skip_special_tokens=False
        )[0]
    
    parsed = processor.post_process_generation(
        generated_text,
        task="<MORE_DETAILED_CAPTION>",
        image_size=(image.width, image.height),
    )
    
    import json
    with open("florence_output.json", "w", encoding="utf-8") as f:
        json.dump(parsed, f, indent=2, ensure_ascii=False)
    print("Result saved to florence_output.json")

run_test()
