import markdown
from weasyprint import HTML, CSS

with open("docs/proyecto/GUIA_ALGORITMO.md", "r", encoding="utf-8") as f:
    md_content = f.read()

html_body = markdown.markdown(md_content, extensions=["tables", "fenced_code"])

full_html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Cómo se deducen los datos meteorológicos - Meteo Huéscar</title>
<style>
  @page {{ size: A4; margin: 2cm; }}
  body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; line-height: 1.6; font-size: 11pt; }}
  h1 {{ color: #1B3668; font-size: 22pt; border-bottom: 3px solid #C9A84C; padding-bottom: 8px; }}
  h2 {{ color: #1B3668; font-size: 15pt; border-left: 4px solid #C9A84C; padding-left: 12px; margin-top: 24px; }}
  h3 {{ color: #333; font-size: 12pt; }}
  table {{ border-collapse: collapse; width: 100%; margin: 12px 0; }}
  th {{ background: #1B3668; color: white; padding: 8px 12px; text-align: left; }}
  td {{ padding: 6px 12px; border-bottom: 1px solid #ddd; }}
  tr:nth-child(even) {{ background: #f8f9fa; }}
  blockquote {{ border-left: 4px solid #C9A84C; padding: 8px 16px; margin: 12px 0; background: #fafaf5; }}
  code {{ background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 10pt; }}
  pre {{ background: #1B3668; color: #d4d9e6; padding: 12px 16px; border-radius: 6px; overflow-x: auto; font-size: 9pt; }}
  hr {{ border: none; border-top: 1px solid #ddd; margin: 20px 0; }}
  .footer {{ text-align: center; color: #888; font-size: 9pt; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 12px; }}
</style>
</head>
<body>
{html_body}
</body>
</html>"""

HTML(string=full_html).write_pdf("docs/proyecto/GUIA_ALGORITMO.pdf")
print("PDF generado correctamente: docs/proyecto/GUIA_ALGORITMO.pdf")
