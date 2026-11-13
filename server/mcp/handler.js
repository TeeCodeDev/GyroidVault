const { all, get, run } = require('../database');
const { getFileUrl, getSlicerLinks } = require('../utils/modelHelpers');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = {
  name: 'gyroidvault-mcp',
  version: '2.3.1'
};

const TOOLS = [
  {
    name: 'search_models',
    description: 'Search and filter 3D models in the GyroidVault library by query, tag, category, or format.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term for model name or description' },
        category: { type: 'string', description: 'Filter by category name' },
        tag: { type: 'string', description: 'Filter by tag name' },
        format: { type: 'string', description: 'Filter by 3D file format (stl, 3mf, step, gcode, obj)' },
        limit: { type: 'number', description: 'Maximum number of models to return (default 10, max 50)' }
      }
    }
  },
  {
    name: 'get_model_details',
    description: 'Retrieve full details of a specific 3D model including all parts, dimensions, print tips, print history, and tags.',
    inputSchema: {
      type: 'object',
      properties: {
        model_id: { type: 'number', description: 'The numeric ID of the model' }
      },
      required: ['model_id']
    }
  },
  {
    name: 'list_collections',
    description: 'List all curated collections and multi-part project folders with model counts.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_collection',
    description: 'Get all 3D models contained within a specific collection.',
    inputSchema: {
      type: 'object',
      properties: {
        collection_id: { type: 'number', description: 'The numeric ID of the collection' }
      },
      required: ['collection_id']
    }
  },
  {
    name: 'get_slicer_link',
    description: 'Generate a direct protocol deep-link to open a 3D model file directly in a slicer (OrcaSlicer, Bambu Studio, Creality Print, Cura).',
    inputSchema: {
      type: 'object',
      properties: {
        file_id: { type: 'number', description: 'The numeric ID of the 3D file' },
        slicer: {
          type: 'string',
          enum: ['orcaslicer', 'bambustudio', 'crealityprint', 'cura'],
          description: 'Target slicer software (default: orcaslicer)'
        }
      },
      required: ['file_id']
    }
  },
  {
    name: 'update_model',
    description: 'Update a model title, recommended print tips/settings, or tags.',
    inputSchema: {
      type: 'object',
      properties: {
        model_id: { type: 'number', description: 'The numeric ID of the model' },
        name: { type: 'string', description: 'New model title' },
        print_tips: { type: 'string', description: 'Recommended slicer/print settings, supports needed, etc.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'List of tag names to assign to the model' }
      },
      required: ['model_id']
    }
  }
];

async function handleToolCall(name, args = {}) {
  switch (name) {
    case 'search_models': {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
      let query = `
        SELECT m.id, m.name, m.description, m.print_tips, m.created_at,
               c.name as category_name,
               (SELECT COUNT(*) FROM files WHERE model_id = m.id) as file_count,
               (SELECT COUNT(*) FROM print_history WHERE model_id = m.id) as print_count
        FROM models m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE m.parent_id IS NULL
      `;
      const params = [];

      if (args.query) {
        query += ' AND (m.name LIKE ? OR m.description LIKE ?)';
        params.push(`%${args.query}%`, `%${args.query}%`);
      }
      if (args.category) {
        query += ' AND LOWER(c.name) = LOWER(?)';
        params.push(args.category.trim());
      }
      if (args.tag) {
        query += ' AND m.id IN (SELECT mt.model_id FROM model_tags mt JOIN tags t ON mt.tag_id = t.id WHERE LOWER(t.name) = LOWER(?))';
        params.push(args.tag.trim());
      }
      if (args.format) {
        query += ' AND m.id IN (SELECT model_id FROM files WHERE LOWER(file_type) = LOWER(?))';
        params.push(args.format.trim());
      }

      query += ' ORDER BY m.updated_at DESC LIMIT ?';
      params.push(limit);

      const rows = all(query, params);
      return {
        count: rows.length,
        models: rows.map(r => ({
          id: r.id,
          name: r.name,
          category: r.category_name,
          file_count: r.file_count,
          printed: r.print_count > 0,
          description: r.description ? (r.description.length > 100 ? r.description.slice(0, 100) + '...' : r.description) : null
        }))
      };
    }

    case 'get_model_details': {
      const id = Number(args.model_id);
      const model = get(`
        SELECT m.*, c.name as category_name 
        FROM models m 
        LEFT JOIN categories c ON m.category_id = c.id 
        WHERE m.id = ?`, [id]);
      if (!model) throw new Error(`Model #${id} not found`);

      const files = all('SELECT id, filename, original_name, file_size, file_type, uploaded_at FROM files WHERE model_id = ?', [id]);
      const tags = all('SELECT t.name FROM tags t JOIN model_tags mt ON mt.tag_id = t.id WHERE mt.model_id = ?', [id]);
      const prints = all('SELECT ph.printed_at, ph.successful, ph.notes, m.name as material FROM print_history ph LEFT JOIN materials m ON ph.material_id = m.id WHERE ph.model_id = ? ORDER BY ph.printed_at DESC', [id]);

      return {
        id: model.id,
        name: model.name,
        category: model.category_name,
        description: model.description,
        print_tips: model.print_tips,
        tags: tags.map(t => t.name),
        files: files.map(f => ({
          id: f.id,
          filename: f.original_name || f.filename,
          size_bytes: f.file_size,
          type: f.file_type
        })),
        print_history: prints
      };
    }

    case 'list_collections': {
      const collections = all(`
        SELECT p.id, p.name, p.description, p.visibility,
               (SELECT COUNT(*) FROM project_models WHERE project_id = p.id) as model_count
        FROM projects p
        ORDER BY p.name ASC
      `);
      return { collections };
    }

    case 'get_collection': {
      const id = Number(args.collection_id);
      const collection = get('SELECT id, name, description, visibility FROM projects WHERE id = ?', [id]);
      if (!collection) throw new Error(`Collection #${id} not found`);

      const models = all(`
        SELECT m.id, m.name, c.name as category_name
        FROM models m
        JOIN project_models pm ON m.id = pm.model_id
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE pm.project_id = ?
      `, [id]);

      return {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        model_count: models.length,
        models
      };
    }

    case 'get_slicer_link': {
      const fileId = Number(args.file_id);
      const slicer = (args.slicer || 'orcaslicer').toLowerCase();
      const file = get('SELECT * FROM files WHERE id = ?', [fileId]);
      if (!file) throw new Error(`File #${fileId} not found`);

      const fileUrl = getFileUrl(file);
      const links = getSlicerLinks(fileUrl, file.original_name || file.filename);
      const link = links[slicer] || links['orcaslicer'];

      return {
        file_id: file.id,
        file_name: file.original_name || file.filename,
        slicer: link ? link.name : slicer,
        deep_link_url: link ? link.url : null
      };
    }

    case 'update_model': {
      const id = Number(args.model_id);
      const model = get('SELECT id FROM models WHERE id = ?', [id]);
      if (!model) throw new Error(`Model #${id} not found`);

      if (args.name !== undefined) {
        run('UPDATE models SET name = ? WHERE id = ?', [args.name.trim(), id]);
      }
      if (args.print_tips !== undefined) {
        run('UPDATE models SET print_tips = ? WHERE id = ?', [args.print_tips, id]);
      }
      if (Array.isArray(args.tags)) {
        // Clear and assign tags
        run('DELETE FROM model_tags WHERE model_id = ?', [id]);
        for (const tagName of args.tags) {
          const trimmed = tagName.trim();
          if (!trimmed) continue;
          let tag = get('SELECT id FROM tags WHERE LOWER(name) = LOWER(?)', [trimmed]);
          if (!tag) {
            const r = run('INSERT INTO tags (name) VALUES (?)', [trimmed]);
            tag = { id: r.lastId };
          }
          run('INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)', [id, tag.id]);
        }
      }

      return {
        success: true,
        message: `Model #${id} updated successfully`
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleMcpMessage(message) {
  const { jsonrpc, id, method, params } = message;
  if (jsonrpc !== '2.0') {
    return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request: jsonrpc must be 2.0' } };
  }

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO
        }
      };

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS }
      };

    case 'tools/call': {
      try {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const result = await handleToolCall(toolName, toolArgs);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          }
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [{ type: 'text', text: `Error: ${err.message}` }]
          }
        };
      }
    }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      };
  }
}

module.exports = {
  handleMcpMessage,
  handleToolCall,
  TOOLS,
  SERVER_INFO,
  PROTOCOL_VERSION
};

