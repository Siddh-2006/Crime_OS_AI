import fitz

doc = fitz.open("corpus/BSA.pdf")

for page_num in [1, 3, 5, 7, 9]:
    page = doc[page_num - 1]

    print(f"\n{'='*60}")
    print(f"PAGE {page_num}")

    for block in page.get_text("blocks"):
        x0, y0, x1, y1, text, *_ = block

        text = text.strip()
        if not text:
            continue

        center = (x0 + x1) / 2

        print(
            f"center={center:7.2f} "
            f"x0={x0:7.2f} "
            f"x1={x1:7.2f} "
            f"text={repr(text[:60])}"
        )

doc.close()