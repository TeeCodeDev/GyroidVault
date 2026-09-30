const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

/**
 * Extracts the thumbnail from a 3MF file (which is a ZIP archive).
 * Typically found at Metadata/thumbnail.png.
 * 
 * @param {string} filePath - Absolute path to the .3mf file
 * @param {string} uploadsDir - Absolute path to the uploads directory where the thumbnail should be saved
 * @returns {string|null} - The relative URL path to the thumbnail (e.g. thumb_xyz.png) or null if not found
 */
function extract3mfThumbnail(filePath, uploadsDir) {
  try {
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();
    
    // Look for thumbnail file. Bambu Studio uses Metadata/plate_1.png, PrusaSlicer/Orca uses Metadata/thumbnail.png.
    let thumbnailEntry = null;
    for (const entry of zipEntries) {
      if (!entry.isDirectory) {
        const lowerName = entry.entryName.toLowerCase();
        if (lowerName === 'metadata/thumbnail.png' || lowerName === 'thumbnail.png' || lowerName.match(/^metadata\/plate_[0-9]+\.png$/)) {
          thumbnailEntry = entry;
          break; // Stop at first valid match
        }
      }
    }

    if (!thumbnailEntry) {
      return null; // No thumbnail found in 3MF
    }

    const { getZipEntryBuffer } = require('./modelHelpers');
      const imgData = getZipEntryBuffer(thumbnailEntry); // Buffer of the image

    if (!imgData || imgData.length === 0) return null;

    // Generate a unique filename for the thumbnail
    const thumbFilename = `thumb_3mf_${crypto.randomBytes(8).toString('hex')}.png`;
    const thumbPath = path.join(uploadsDir, thumbFilename);

    // Save the image buffer to the file
    fs.writeFileSync(thumbPath, imgData);

    return thumbFilename;
  } catch (error) {
    console.error(`Failed to extract 3MF thumbnail for ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Parses an STL file (ASCII or binary) into a de-duplicated mesh.
 *
 * @param {Buffer} buf - Raw contents of the .stl file
 * @returns {{verts: number[][], tris: number[][]}} - Vertex list and triangles indexing into it
 */
function stlToMesh(buf) {
  // A binary STL is 84 bytes of header followed by 50 bytes per triangle. Checking
  // the length is more reliable than sniffing for "solid", which binary exporters
  // also write into the header.
  const triCount = buf.length >= 84 ? buf.readUInt32LE(80) : 0;
  const isBinary = buf.length >= 84 + triCount * 50;

  const verts = [], tris = [], seen = new Map();
  const addVertex = (x, y, z) => {
    const key = `${x},${y},${z}`;
    let i = seen.get(key);
    if (i === undefined) { i = verts.length; verts.push([x, y, z]); seen.set(key, i); }
    return i;
  };

  if (isBinary) {
    let off = 84;
    for (let i = 0; i < triCount; i++, off += 50) {
      tris.push([
        addVertex(buf.readFloatLE(off + 12), buf.readFloatLE(off + 16), buf.readFloatLE(off + 20)),
        addVertex(buf.readFloatLE(off + 24), buf.readFloatLE(off + 28), buf.readFloatLE(off + 32)),
        addVertex(buf.readFloatLE(off + 36), buf.readFloatLE(off + 40), buf.readFloatLE(off + 44))
      ]);
    }
  } else {
    const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
    const text = buf.toString('utf8');
    let m, pending = [];
    while ((m = re.exec(text)) !== null) {
      pending.push(addVertex(Number(m[1]), Number(m[2]), Number(m[3])));
      if (pending.length === 3) { tris.push(pending); pending = []; }
    }
  }

  return { verts, tris };
}

/**
 * Wraps a mesh in a minimal 3MF container (an OPC ZIP holding 3D/3dmodel.model).
 *
 * @param {{verts: number[][], tris: number[][]}} mesh - Mesh as returned by stlToMesh
 * @returns {Buffer} - The .3mf file contents
 */
function meshTo3mf(mesh) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n <resources>\n  <object id="1" type="model">\n   <mesh>\n    <vertices>\n'];
  for (const v of mesh.verts) out.push(`     <vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>\n`);
  out.push('    </vertices>\n    <triangles>\n');
  for (const t of mesh.tris) out.push(`     <triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>\n`);
  out.push('    </triangles>\n   </mesh>\n  </object>\n </resources>\n <build>\n  <item objectid="1"/>\n </build>\n</model>\n');

  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>', 'utf8'));
  zip.addFile('_rels/.rels', Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>', 'utf8'));
  zip.addFile('3D/3dmodel.model', Buffer.from(out.join(''), 'utf8'));
  return zip.toBuffer();
}

module.exports = {
  extract3mfThumbnail,
  stlToMesh,
  meshTo3mf
};
