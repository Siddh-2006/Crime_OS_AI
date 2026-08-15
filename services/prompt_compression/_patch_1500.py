path = r"services\prompt_compression\test_manual.py"
with open(path, encoding="utf-8") as f:
    content = f.read()

content = content.replace('"num_predict": 800', '"num_predict": 1500')

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Patched OK")
