path = r"services\prompt_compression\test_manual.py"
with open(path, encoding="utf-8") as f:
    content = f.read()

old = (
    '"stream": False,\n'
    '        "options": {\n'
    '            "temperature": 0.1,   # near-deterministic for fair comparison\n'
    '            "num_predict": 600,\n'
    '        },\n'
)
new = (
    '"stream": False,\n'
    '        "think": False,\n'
    '        "options": {\n'
    '            "temperature": 0.1,   # near-deterministic for fair comparison\n'
    '            "num_predict": 800,\n'
    '        },\n'
)

if old in content:
    content = content.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched OK")
else:
    # Try with \r\n
    old2 = old.replace('\n', '\r\n')
    new2 = new.replace('\n', '\r\n')
    if old2 in content:
        content = content.replace(old2, new2)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print("Patched OK (CRLF)")
    else:
        print("NOT FOUND - showing surrounding lines:")
        for i, line in enumerate(content.splitlines(), 1):
            if 'num_predict' in line or '"stream"' in line or '"think"' in line:
                print(f"  {i}: {repr(line)}")
