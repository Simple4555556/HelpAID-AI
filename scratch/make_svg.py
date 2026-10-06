import base64

with open('public/logo.png', 'rb') as f:
    b64_data = base64.b64encode(f.read()).decode('utf-8')

svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 267" width="100%" height="100%">
  <image href="data:image/png;base64,{b64_data}" width="230" height="267" />
</svg>'''

with open('public/logo.svg', 'w', encoding='utf-8') as f:
    f.write(svg_content)

print("Successfully updated public/logo.svg with user shield image!")
