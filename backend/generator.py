"""Millimetre mesh generation. No Blender required."""
from pathlib import Path
import argparse
import numpy as np
import trimesh
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from shapely.geometry import Polygon, GeometryCollection, box
from shapely.ops import unary_union
from shapely.affinity import translate, scale

ROOT = Path(__file__).resolve().parent
FACE_Z = 0.9201
RIM_Z = 1.924936
AREAS = {
    "name": dict(x=0, y=6, width=38, height=5, max_size=6.5),
    "phone": dict(x=0, y=1, width=38, height=2.5, max_size=3.5),
}

def polygons(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    return [p for child in g.geoms for p in polygons(child)]

def extrude(g, bottom, height):
    pieces = []
    for p in polygons(g):
        m = trimesh.creation.extrude_polygon(p, height, engine='earcut')
        m.apply_translation([0, 0, bottom])
        pieces.append(m)
    return trimesh.util.concatenate(pieces)

def prepare_blank(source=ROOT / 'models/original.stl'):
    """Rebuild this nearly planar, defective source as two watertight layers.
    Preserve the projected outline and rim; flatten the ~0.01mm face variation.
    This procedure is specific to the supplied bowtie, not arbitrary STL files.
    """
    original = trimesh.load_mesh(source)
    t = original.triangles
    upward = original.face_normals[:, 2] > 0.01
    face = unary_union([Polygon(tri[:, :2]) for tri in t[upward]])
    rim = unary_union([Polygon(tri[:, :2]) for tri in t[upward & (t[:, :, 2].mean(axis=1) > 1.5)]])
    base = extrude(face, -1, FACE_Z + 1)
    raised = extrude(rim, FACE_Z - 0.05, RIM_Z - FACE_Z + 0.05)
    solid = trimesh.boolean.union([base, raised], engine='manifold')
    hole = trimesh.creation.cylinder(radius=2.5, height=10, sections=96)
    hole.apply_translation([0, 13, 0])
    solid = trimesh.boolean.difference([solid, hole], engine='manifold')
    if not solid.is_volume: raise ValueError('Blank reconstruction failed')
    # Assert both complete rectangles lie in the recessed face and avoid hole.
    interior = face.difference(rim).difference(Polygon(hole.vertices[:, :2]).convex_hull)
    for area in AREAS.values():
        x,y,w,h = (area[k] for k in ['x','y','width','height'])
        if not interior.covers(box(x-w/2,y-h/2,x+w/2,y+h/2)):
            raise ValueError('Text area crosses border or attachment hole')
    return solid

class OutlinePen(BasePen):
    def __init__(self, glyphs):
        super().__init__(glyphs)
        self.contours = []
        self.points = []
    def _moveTo(self, p): self.points = [p]
    def _lineTo(self, p): self.points.append(p)
    def _qCurveToOne(self, p1, p2):
        p0 = np.array(self._getCurrentPoint())
        p1,p2 = np.array(p1),np.array(p2)
        for t in np.linspace(0,1,25)[1:]:
            self.points.append(tuple((1-t)**2*p0 + 2*(1-t)*t*p1 + t*t*p2))
    def _curveToOne(self, p1, p2, p3):
        p0 = np.array(self._getCurrentPoint())
        p1,p2,p3 = np.array(p1),np.array(p2),np.array(p3)
        for t in np.linspace(0,1,33)[1:]:
            self.points.append(tuple((1-t)**3*p0+3*(1-t)**2*t*p1+3*(1-t)*t*t*p2+t**3*p3))
    def _closePath(self):
        if len(self.points) >= 3: self.contours.append(self.points)
        self.points = []
    def _endPath(self): self._closePath()

def text_outline(value, font_path):
    with TTFont(font_path) as font:
        cmap = font.getBestCmap()
        glyphs = font.getGlyphSet()
        units = font['head'].unitsPerEm
        advance = 0
        shapes = []
        for char in value:
            if ord(char) not in cmap: raise ValueError(f'Unsupported character: {char!r}')
            glyph = cmap[ord(char)]
            pen = OutlinePen(glyphs)
            glyphs[glyph].draw(pen)
            # XOR closed contours to preserve counters in letters and digits.
            shape = GeometryCollection()
            for contour in pen.contours:
                p = Polygon(contour)
                if not p.is_valid: p = p.buffer(0)
                shape = shape.symmetric_difference(p)
            if not shape.is_empty: shapes.append(translate(shape, xoff=advance))
            advance += font['hmtx'].metrics[glyph][0]
        if not shapes: raise ValueError('Text must contain visible characters')
        result = unary_union(shapes)
        return scale(result, xfact=1/units, yfact=1/units, origin=(0,0))

def fitted_text(value, area, font_path):
    g = text_outline(value, font_path)
    xmin,ymin,xmax,ymax = g.bounds
    factor = min(area['max_size'], area['width']/(xmax-xmin), area['height']/(ymax-ymin))
    g = translate(g, xoff=-(xmin+xmax)/2, yoff=-(ymin+ymax)/2)
    g = scale(g, xfact=factor, yfact=factor, origin=(0,0))
    g = translate(g, xoff=area['x'], yoff=area['y'])
    # 0.20mm overlap with base; exactly 0.80mm raised above recessed face.
    return extrude(g, FACE_Z-0.20, 1.0), factor

def generate(pet_name, phone_number, output, font_path=ROOT/'fonts/DejaVuSans-Bold.ttf'):
    name,phone = pet_name.strip(),phone_number.strip()
    if not (1 <= len(name) <= 24 and 1 <= len(phone) <= 24):
        raise ValueError('Name and phone number must each contain 1–24 characters')
    if any(ord(c)<32 for c in name+phone): raise ValueError('Control characters are not supported')
    blank = trimesh.load_mesh(ROOT/'models/pet-tag.stl')
    if not blank.is_volume: raise ValueError('Prepared blank is not a closed volume')
    name_mesh,name_size = fitted_text(name, AREAS['name'], font_path)
    phone_mesh,phone_size = fitted_text(phone, AREAS['phone'], font_path)
    result = trimesh.boolean.union([blank, name_mesh, phone_mesh], engine='manifold')
    if not result.is_volume or len(result.split(only_watertight=False)) != 1:
        raise ValueError('Generated tag is not one connected, closed volume')
    output = Path(output)
    output.parent.mkdir(parents=True,exist_ok=True)
    result.export(output)
    return dict(name_font_size_mm=name_size,phone_font_size_mm=phone_size)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepare',action='store_true')
    parser.add_argument('--name',default='Milo')
    parser.add_argument('--phone',default='0412 345 678')
    parser.add_argument('--output',default='pet-tag.stl')
    args = parser.parse_args()
    if args.prepare:
        prepare_blank().export(ROOT/'models/pet-tag.stl')
    else:
        print(generate(args.name,args.phone,args.output))
