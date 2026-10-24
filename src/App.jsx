import React, { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const API = "http://localhost:8000";
const colours = {
  Gold: "#f7d023",
  Blue: "#2aa4eb",
  Pink: "#e457cc",
  White: "#ffffff",
  Silver: "#a7a7a7",
};

const maxFontSize = 7;
const fontHeight = 7;
const phoneFontSize = 4;
const phoneHeight = 4;

// Per-model layouts calibrated to these supplied blanks.
const MODELS = [
  {
    id: "bowtie",
    label: "Bowtie",
    url: "/models/bowtie.stl",
    rotation: [0, 0, 0],
    faceZ: 0.5020023584365845,
    font: "/fonts/DejaVuSans-Bold.typeface.json",
    name: {
      x: 0.0,
      y: 0.5557498931884766,
      width: 34,
      height: fontHeight,
      maxFontSize: maxFontSize,
    },
    phone: {
      x: 0.0,
      y: -4.444250106811523,
      width: 32,
      height: phoneHeight,
      maxFontSize: phoneFontSize,
    },
  },
  {
    id: "cat",
    label: "Cat",
    url: "/models/cat.stl",
    rotation: [0, 0, 0],
    faceZ: 0.471699059009552,
    font: "/fonts/DejaVuSans-Bold.typeface.json",
    name: {
      x: 0.0,
      y: 2.0704526901245117,
      width: 32,
      height: fontHeight,
      maxFontSize: maxFontSize,
    },
    phone: {
      x: 0.0,
      y: -5.929547309875488,
      width: 32,
      height: phoneHeight,
      maxFontSize: phoneFontSize,
    },
  },
  {
    id: "dog",
    label: "Dog",
    url: "/models/dog.stl",
    rotation: [0, 0, 0],
    faceZ: 0.4673907160758972,
    font: "/fonts/DejaVuSans-Bold.typeface.json",
    name: {
      x: 0.0,
      y: 4.488112449645996,
      width: 30,
      height: fontHeight,
      maxFontSize: maxFontSize,
    },
    phone: {
      x: 0.0,
      y: -0.5118875503540039,
      width: 30,
      height: phoneHeight,
      maxFontSize: phoneFontSize,
    },
  },
  {
    id: "round",
    label: "Round",
    url: "/models/round.stl",
    rotation: [0, 0, 0],
    faceZ: 0.46920037269592285,
    font: "/fonts/DejaVuSans-Bold.typeface.json",
    name: {
      x: 0.0,
      y: 2.0,
      width: 30,
      height: fontHeight,
      maxFontSize: maxFontSize,
    },
    phone: {
      x: 0.0,
      y: -5.0,
      width: 30,
      height: phoneHeight,
      maxFontSize: phoneFontSize,
    },
  },
];

// Procedural height map: one filament ridge per repeat, with subtle grain.
// This is a lighting effect, so the selected filament colour stays unchanged.
function createPrintTexture() {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const ridge = (1 + Math.cos((y / size) * Math.PI * 2)) / 2;
    for (let x = 0; x < size; x++) {
      const grain = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const height = Math.round(
        255 * (0.1 + 0.8 * ridge + 0.015 * (grain - Math.floor(grain))),
      );
      const i = (y * size + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = height;
      pixels[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const PRINT = {
  lineWidth: 0.42, // top-surface toolpath spacing, mm
  layerHeight: 0.2, // side-wall layer spacing, mm
  perimeters: 2, // outline-following passes before diagonal fill
  bumpScale: 0.12, // exaggerated slightly for the preview
};

// Project flat front triangles into an atlas and extract their boundary edges.
// Shared triangle edges cancel: triangulation diagonals never become print lines.
function makePrintGeometry(source) {
  const flat = source.index ? source.toNonIndexed() : source.clone();
  flat.computeBoundingBox();
  const bounds = flat.boundingBox;
  const width = Math.max(bounds.max.x - bounds.min.x, 0.001);
  const height = Math.max(bounds.max.y - bounds.min.y, 0.001);
  const positions = flat.getAttribute("position");
  const top = [],
    sides = [],
    edges = new Map();
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const uv = new Float32Array(positions.count * 2);
  const vertexKey = (v) =>
    [v.x, v.y, v.z].map((n) => Math.round(n * 10000)).join(",");
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i);
    b.fromBufferAttribute(positions, i + 1);
    c.fromBufferAttribute(positions, i + 2);
    normal
      .crossVectors(
        new THREE.Vector3().subVectors(b, a),
        new THREE.Vector3().subVectors(c, a),
      )
      .normalize();
    const front = normal.z > 0.7;
    (front ? top : sides).push(i, i + 1, i + 2);
    if (front) {
      for (const [p, q] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const pkey = vertexKey(p),
          qkey = vertexKey(q);
        const key = pkey < qkey ? `${pkey}|${qkey}` : `${qkey}|${pkey}`;
        const entry = edges.get(key);
        if (entry) entry.count++;
        else edges.set(key, { count: 1, p: [p.x, p.y], q: [q.x, q.y] });
      }
    }
    for (let j = i; j < i + 3; j++) {
      const x = positions.getX(j),
        y = positions.getY(j),
        z = positions.getZ(j);
      if (front) {
        uv[j * 2] = (x - bounds.min.x) / width;
        uv[j * 2 + 1] = (y - bounds.min.y) / height;
      } else if (normal.z < -0.7) {
        // Underside: diagonal fill without front-face rim outlines.
        uv[j * 2] = (x - y) / (Math.SQRT2 * PRINT.lineWidth);
        uv[j * 2 + 1] = (x + y) / (Math.SQRT2 * PRINT.lineWidth);
      } else {
        uv[j * 2] =
          (Math.abs(normal.x) > Math.abs(normal.y) ? y : x) / PRINT.lineWidth;
        uv[j * 2 + 1] = z / PRINT.layerHeight;
      }
    }
  }
  flat.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  // Two contiguous material groups keep the number of draw calls small.
  const order = [...top, ...sides];
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(flat.attributes)) {
    const data = new attribute.array.constructor(attribute.array.length);
    for (let i = 0; i < order.length; i++) {
      for (let k = 0; k < attribute.itemSize; k++) {
        data[i * attribute.itemSize + k] =
          attribute.array[order[i] * attribute.itemSize + k];
      }
    }
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(data, attribute.itemSize, attribute.normalized),
    );
  }
  geometry.addGroup(0, top.length, 0);
  geometry.addGroup(top.length, sides.length, 1);
  geometry.userData.printBounds = {
    x: bounds.min.x,
    y: bounds.min.y,
    width,
    height,
  };
  geometry.userData.printEdges = [...edges.values()].filter(
    (edge) => edge.count === 1,
  );
  geometry.computeBoundingBox();
  flat.dispose();
  return geometry;
}

// Paint a height field: diagonal fill in the interior, then distance-to-outline
// bands over it. Rounded strokes approximate inward offset contour passes,
// including letter counters and the tag hole. The mesh clips the outer half.
function createTopTexture(geometry) {
  const bounds = geometry.userData.printBounds;
  const pixelsPerMM = Math.min(
    28,
    1024 / Math.max(bounds.width, bounds.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(32, Math.ceil(bounds.width * pixelsPerMM));
  canvas.height = Math.max(32, Math.ceil(bounds.height * pixelsPerMM));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the print texture");
  const sx = canvas.width / bounds.width,
    sy = canvas.height / bounds.height;
  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const mx = bounds.x + (x + 0.5) / sx;
      const my = bounds.y + bounds.height - (y + 0.5) / sy;
      const phase = (mx + my) / (Math.SQRT2 * PRINT.lineWidth);
      const ridge = (1 + Math.cos(phase * Math.PI * 2)) / 2;
      const value = Math.round(35 + 185 * ridge);
      const offset = (y * canvas.width + x) * 4;
      image.data[offset] =
        image.data[offset + 1] =
        image.data[offset + 2] =
          value;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  // Draw in mm, so stroke width stays physically consistent on wide/narrow text.
  context.setTransform(
    sx,
    0,
    0,
    -sy,
    -bounds.x * sx,
    (bounds.y + bounds.height) * sy,
  );
  context.lineCap = "round";
  context.lineJoin = "round";
  const path = new Path2D();
  for (const edge of geometry.userData.printEdges) {
    path.moveTo(...edge.p);
    path.lineTo(...edge.q);
  }
  const band = PRINT.lineWidth * PRINT.perimeters;
  const step = 1 / pixelsPerMM;
  for (let distance = band; distance >= 0; distance -= step) {
    // Ridges centred half a line width from the physical boundary.
    const ridge =
      (1 - Math.cos((distance / PRINT.lineWidth) * Math.PI * 2)) / 2;
    const value = Math.round(35 + 185 * ridge);
    context.strokeStyle = `rgb(${value},${value},${value})`;
    context.lineWidth = Math.max(distance * 2, step);
    context.stroke(path);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function makePrintSurface(source) {
  const geometry = makePrintGeometry(source);
  return { geometry, topTexture: createTopTexture(geometry) };
}

function PrintedMaterial({ colour, texture, attach }) {
  return (
    <meshStandardMaterial
      attach={attach}
      color={colours[colour]}
      roughness={0.45}
      metalness={0.6}
      bumpMap={texture}
      bumpScale={PRINT.bumpScale}
    />
  );
}

function PrintedBody({ geometry, colour, texture }) {
  const surface = useMemo(() => makePrintSurface(geometry), [geometry]);
  useEffect(() => {
    surface.topTexture.needsUpdate = true;
    return () => {
      surface.geometry.dispose();
      surface.topTexture.dispose();
    };
  }, [surface]);
  return (
    <mesh geometry={surface.geometry} dispose={null} castShadow receiveShadow>
      <PrintedMaterial
        attach="material-0"
        colour={colour}
        texture={surface.topTexture}
      />
      <PrintedMaterial attach="material-1" colour={colour} texture={texture} />
    </mesh>
  );
}

// Real extruded preview letters remain legible in the same colour as the tag.
// Fit in X/Y only, keeping their printed height constant for long names.
function FitText({ value, area, z, colour, font, texture }) {
  const surface = useMemo(() => {
    if (!value.trim()) return null;
    const mesh = new TextGeometry(value, {
      font,
      size: 1,
      depth: 1,
      curveSegments: 16,
      bevelEnabled: false,
    });
    mesh.computeBoundingBox();
    const bounds = mesh.boundingBox;
    const width = bounds.max.x - bounds.min.x;
    const height = bounds.max.y - bounds.min.y;
    if (!(width > 0 && height > 0)) {
      mesh.dispose();
      return null;
    }
    const factor = Math.min(
      area.maxFontSize,
      area.width / width,
      area.height / height,
    );
    mesh.translate(
      -(bounds.min.x + bounds.max.x) / 2,
      -(bounds.min.y + bounds.max.y) / 2,
      -bounds.min.z,
    );
    mesh.scale(factor, factor, 1);
    const prepared = makePrintSurface(mesh);
    mesh.dispose();
    return prepared;
  }, [value, area, font]);
  useEffect(() => {
    if (!surface) return;
    surface.topTexture.needsUpdate = true;
    return () => {
      surface.geometry.dispose();
      surface.topTexture.dispose();
    };
  }, [surface]);
  if (!surface) return null;
  return (
    <mesh
      position={[area.x, area.y, z]}
      geometry={surface.geometry}
      dispose={null}
      castShadow
      receiveShadow
    >
      <PrintedMaterial
        attach="material-0"
        colour={colour}
        texture={surface.topTexture}
      />
      <PrintedMaterial attach="material-1" colour={colour} texture={texture} />
    </mesh>
  );
}

function Preview({ config, geometry, font, model, previewUpdating }) {
  const printTexture = useMemo(createPrintTexture, []);
  useEffect(() => {
    printTexture.needsUpdate = true;
    return () => printTexture.dispose();
  }, [printTexture]);

  const size = geometry?.boundingBox;
  const extent = size
    ? Math.max(
        size.max.x - size.min.x,
        size.max.y - size.min.y,
        size.max.z - size.min.z,
      )
    : 40;
  const distance = Math.max(extent * 2.2, 30);
  return (
    <div className="preview">
      <Canvas
        shadows
        camera={{
          position: [0, 0, distance],
          fov: 35,
          near: 0.1,
          far: distance * 20,
        }}
      >
        <ambientLight intensity={0.5} />
        <hemisphereLight args={["#ffffff", "#786b5a", 1]} />
        <directionalLight
          position={[-25, 30, 40]}
          intensity={3}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-35}
          shadow-camera-right={35}
          shadow-camera-top={35}
          shadow-camera-bottom={-35}
          shadow-camera-near={1}
          shadow-camera-far={150}
          shadow-bias={-0.00003}
          shadow-normalBias={0.02}
        />
        <directionalLight position={[25, -10, 15]} intensity={0.6} />
        {geometry && (
          <group rotation={[-0.12, 0, 0]}>
            <PrintedBody
              geometry={geometry}
              colour={config.colour}
              texture={printTexture}
            />
            <FitText
              value={config.petName.trim() || "PET NAME"}
              area={model.name}
              z={model.faceZ - 0.2}
              colour={config.colour}
              font={font}
              texture={printTexture}
            />
            <FitText
              value={config.phoneNumber.trim()}
              area={model.phone}
              z={model.faceZ - 0.2}
              colour={config.colour}
              font={font}
              texture={printTexture}
            />
          </group>
        )}
        <OrbitControls
          enablePan={false}
          minDistance={distance * 0.4}
          maxDistance={distance * 3}
        />
      </Canvas>
      <div className="preview-tip" role="status">
        {previewUpdating
          ? "Updating preview…"
          : "Drag to rotate · Scroll to zoom"}
      </div>
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState({
    modelId: "bowtie",
    petName: "MILO",
    phoneNumber: "0412 345 678",
    colour: "Gold",
  });

  const [previewText, setPreviewText] = useState({
    petName: config.petName,
    phoneNumber: config.phoneNumber,
  });

  const previewUpdating =
    previewText.petName !== config.petName ||
    previewText.phoneNumber !== config.phoneNumber;

  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewText({
        petName: config.petName,
        phoneNumber: config.phoneNumber,
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [config.petName, config.phoneNumber]);

  const MODEL =
    MODELS.find((model) => model.id === config.modelId) || MODELS[0];
  const [geometry, setGeometry] = useState(null);
  const [loadedModelId, setLoadedModelId] = useState(null);
  const [font, setFont] = useState(null);
  const [modelError, setModelError] = useState("");
  const [status, setStatus] = useState("");
  const [order, setOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setGeometry(null);
    setFont(null);
    setLoadedModelId(null);
    setModelError("");
    const controller = new AbortController();
    let loaded;
    let active = true;
    async function load() {
      try {
        const [response, fontResponse] = await Promise.all([
          fetch(MODEL.url, { signal: controller.signal }),
          fetch(MODEL.font, { signal: controller.signal }),
        ]);
        if (!response.ok)
          throw new Error(`STL request failed (${response.status})`);
        if (!fontResponse.ok)
          throw new Error(`Font request failed (${fontResponse.status})`);
        const [modelBytes, fontData] = await Promise.all([
          response.arrayBuffer(),
          fontResponse.json(),
        ]);
        const loadedFont = new FontLoader().parse(fontData);
        loaded = new STLLoader().parse(modelBytes);
        if (!loaded.getAttribute("position")?.count)
          throw new Error("The STL contains no vertices");
        loaded.rotateX(MODEL.rotation[0]);
        loaded.rotateY(MODEL.rotation[1]);
        loaded.rotateZ(MODEL.rotation[2]);
        loaded.center();
        loaded.computeVertexNormals();
        loaded.computeBoundingBox();
        const b = loaded.boundingBox;
        if (![...b.min.toArray(), ...b.max.toArray()].every(Number.isFinite))
          throw new Error("Invalid STL coordinates");
        if (active) {
          setFont(loadedFont);
          setGeometry(loaded);
          setLoadedModelId(MODEL.id);
        }
      } catch (error) {
        if (active && error.name !== "AbortError")
          setModelError(`Could not load the blank tag: ${error.message}`);
      } finally {
        if (!active) loaded?.dispose();
      }
    }
    load();
    return () => {
      active = false;
      controller.abort();
      loaded?.dispose();
    };
  }, [MODEL]);

  const update = (key, value) => {
    setConfig((current) => ({ ...current, [key]: value }));
    setOrder(null);
    setStatus("");
  };

  async function submitOrder(event) {
    event.preventDefault();
    if (
      submitting ||
      !geometry ||
      loadedModelId !== MODEL.id ||
      !config.petName.trim() ||
      !config.phoneNumber.trim()
    )
      return;
    setSubmitting(true);
    setOrder(null);
    setStatus("");
    try {
      // server.py uses the prepared blank and font to generate printable raised text.
      const response = await fetch(`${API}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL.id,
          petName: config.petName.trim(),
          phoneNumber: config.phoneNumber.trim(),
          colour: config.colour,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = data?.detail;
        const message =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((item) => item.msg).join("; ")
              : `Could not create order (${response.status})`;
        throw new Error(message);
      }
      if (!data || data.id == null)
        throw new Error("The server returned an invalid order response");
      setOrder(data);
      setStatus("Order submitted for manual review.");
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <header className="header">
        <div>
          <p className="eyebrow">PRINT MODULAR</p>
          <h1>3D Printed Custom Pet Tag</h1>
          <p className="subtitle">
            Choose a colour and add your pet’s name and phone number.
          </p>
        </div>
      </header>
      <section className="workspace">
        <div className="preview-panel">
          {modelError ? (
            <div className="status" role="alert">
              {modelError}
            </div>
          ) : geometry && loadedModelId === MODEL.id ? (
            <Preview
              config={{ ...config, ...previewText }}
              geometry={geometry}
              font={font}
              model={MODEL}
              previewUpdating={previewUpdating}
            />
          ) : (
            <div className="status" role="status">
              Loading blank tag…
            </div>
          )}
        </div>
        <form className="controls" onSubmit={submitOrder}>
          <fieldset
            disabled={submitting}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            <section className="section">
              <label>
                Pet name
                <input
                  required
                  value={config.petName}
                  maxLength={24}
                  onChange={(e) =>
                    update(
                      "petName",
                      e.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                    )
                  }
                  placeholder="e.g. MILO"
                />
              </label>
              <label>
                Phone number
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  value={config.phoneNumber}
                  maxLength={24}
                  onChange={(e) =>
                    update(
                      "phoneNumber",
                      e.target.value.replace(/[^0-9 ]/g, ""),
                    )
                  }
                  placeholder="e.g. 0412 345 678"
                />
              </label>
            </section>
            <section className="section">
              <h2>Tag model</h2>
              <div className="choices">
                {MODELS.map((model) => (
                  <button
                    type="button"
                    key={model.id}
                    aria-pressed={config.modelId === model.id}
                    className={
                      config.modelId === model.id ? "choice active" : "choice"
                    }
                    onClick={() => update("modelId", model.id)}
                  >
                    {model.label}
                  </button>
                ))}
              </div>
            </section>
            <section className="section">
              <h2>Colour</h2>
              <div className="colour-grid">
                {Object.keys(colours).map((colour) => (
                  <button
                    type="button"
                    key={colour}
                    aria-pressed={config.colour === colour}
                    className={
                      config.colour === colour ? "colour active" : "colour"
                    }
                    onClick={() => update("colour", colour)}
                  >
                    <span style={{ background: colours[colour] }} />
                    {colour}
                  </button>
                ))}
              </div>

              <p>
                Printed colours may vary from the screen preview. Text size and
                placement may be adjusted to fit the physical tag.
              </p>
            </section>
            <button
              className="submit"
              disabled={
                submitting ||
                !geometry ||
                loadedModelId !== MODEL.id ||
                !config.petName.trim() ||
                !config.phoneNumber.trim()
              }
            >
              {submitting ? "Submitting…" : "Submit order for review"}
            </button>
          </fieldset>
          {status && (
            <div className="status" role="status">
              {status}
            </div>
          )}
          {order && (
            <div className="order-result">
              <strong>Order #{order.id}</strong>
            </div>
          )}
        </form>
      </section>
      <footer>
        <span>Print Modular</span>
      </footer>
    </main>
  );
}
