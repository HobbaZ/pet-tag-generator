PET TAG GENERATOR — supplied bowtie model

Included:
  app.js: replacement React component for your existing project and CSS.
  public/models/pet-tag.stl: repaired blank with a 5mm diameter upper hole.
  public/fonts/DejaVuSans-Bold.ttf: shared preview/print font.
  backend/generator.py: ordinary Python generator; Blender is not required.
  backend/server.py: compatible local /api/orders and STL download API.
  backend/models/original.stl: your original, unchanged.
  example-DAISY.stl: generated, checked example using a placeholder phone number.

SETUP
1. Replace your existing app.js and copy the public/ contents into your React
   project's public folder. Keep your existing CSS. Existing dependencies:
   react, three, @react-three/fiber, @react-three/drei.
2. Using Python 3.12 or newer, install Python dependencies and start the backend from the backend folder:

   python -m venv .venv
   Windows: .venv\Scripts\activate
   macOS/Linux: source .venv/bin/activate
   python -m pip install -r requirements.txt
   python -m uvicorn server:app --host 127.0.0.1 --port 8000

3. Start your existing React project. Both name and phone number are required.
   Allowed local frontend origins are localhost/127.0.0.1 on ports 3000 or 5173.
   Change the origin list in server.py if your development port differs.

COMMAND LINE GENERATION
From backend/:
   python generator.py --name "Milo" --phone "0412 345 678" --output milo.stl

MODEL AND LAYOUT
Numeric units are millimetres. Overall dimensions: 53.1888 x 33.8961 x 2.9249mm.
The original has nonmanifold edges around its four inner corners. Its supplied
silhouette and raised border are reconstructed as closed solids. The recessed
face's approximately 0.01mm height variation is flattened to Z=0.9201mm.
The original file is retained unchanged.

Hole: radius 2.5mm, centre X=0,Y=13, through the whole tag. This differs from
Y=5 in your Blender script so the centre has room for both text lines.
Name rectangle: 38 x 5mm at X=0,Y=6.
Phone rectangle: 38 x 2.5mm at X=0,Y=1.
Text: 0.8mm raised above the recessed face, with 0.2mm overlap before union.
Each line shrinks uniformly into its own rectangle. The repaired tag's raised
border remains slightly taller than the text. Long text can become too small
for your printer: inspect the generated STL before printing.

The bundled DejaVu Sans Bold replaces Windows-specific Tahoma Bold so both
platforms can use the included font. Font licence is in FONT-LICENSE.txt.
The preview uses the same font and calibrated rectangles, but glyph spacing
can differ slightly because browser and Python text layout differ. Preview
text is a flat overlay; the downloadable STL contains real raised geometry.

Standard STL does not store filament colours. The selected colour is saved in
backend/orders/<id>/order.json for manual production. The generated mesh is one
solid; text contrast in the browser is a visual aid, not a second filament.

VALIDATION
DAISY, a 24-character name, and an accented name with punctuation were generated
and checked as single connected, watertight volumes. API submission, STL
retrieval, blank text rejection, and invalid order ID handling were checked.
React JSX syntax was checked. The full React browser app was not run because your project was not supplied.
This is a local manual-order workflow, not a deployed service or print trial.

Do not substitute another model without defining new safe areas and checking
its front surface, hole, and mesh validity. prepare_blank() is specific to this
supplied bowtie. To rebuild its prepared copy: python generator.py --prepare
