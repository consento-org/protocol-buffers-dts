function scalarType (type) {
  switch (type) {
    case 'float':
    case 'double':
    case 'sfixed32':
    case 'fixed32':
    case 'varint':
    case 'enum':
    case 'uint64':
    case 'uint32':
    case 'int64':
    case 'int32':
    case 'sint64':
    case 'sint32':
      return 'number'

    case 'string':
      return 'string'

    case 'bool':
      return 'boolean'

    case 'bytes':
      return 'Buffer'
  }
  return type
}

/**
 * @param {import('protocol-buffers-schema/types').Field} field
 */
function fieldType (field) {
  const type = scalarType(field.type)
  switch (type) {
    case 'map':
      return `{ [key: string]: ${scalarType(field.map.to)} }`
  }
  return type
}

/***
 * @param {import('protocol-buffers-schema/types').Schema} schema
 */
function fromSchema (schema, name = 'schema') {
  const exportedTypes = []
  const maps = new Set()
  const enums = new Set()
  const subMessages = new Set()
  let hasBuffer = false
  const addEnum = (name, e) => {
    enums.add(name)
    exportedTypes.push({
      name,
      type: name.includes('_') ? undefined : `def.${name}`,
      data: `
    type ${name} = {${Object.entries(e.values).map(([name, field]) => `
      ${name}: ${field.value}`
        ).join('')}
    }`
    })
  }
  schema.enums.forEach(e => addEnum(e.name, e))

  /**
   * @param {import('protocol-buffers-schema/types').Message} message
   * @param {string} prefix
   */
  const addMessage = (message, prefix = '') => {
    const name = `${prefix}${message.name}`
    subMessages.add(name)
    message.messages.forEach(msg => addMessage(msg, `${name}_`))
    message.enums.forEach(e => addEnum(`${name}_${e.name}`, e))
    const oneOfs = message.fields.reduce((oneOfs, field) => {
      if (field.oneof) {
        const options = oneOfs[field.oneof]
        if (!options) {
          oneOfs[field.oneof] = [field]
        } else {
          options.push(field)
        }
      }
      return oneOfs
    }, {})
    for (const mapField of message.fields.filter(field => field.type === 'map')) {
      if (mapField.type === 'map') {
        const mapName = `Map_${mapField.map.from}_${mapField.map.to}`
        if (!maps.has(mapName)) {
          maps.add(mapName)
          exportedTypes.push({
            name: mapName,
            type: `Codec<{ [key: string]: ${scalarType(mapField.map.to)} }>`
          })
        }
      }
    }
    const fields = message.fields.filter(field => !field.oneof)
    let base = '{}'
    const toType = field => {
      let type = fieldType(field)
      const parts = type.split('_')
      parts.unshift(name)
      while (parts.length > 0) {
        const childType = parts.join('_')
        if (enums.has(childType)) {
          type = `Values<${childType}>`
          break
        }
        if (subMessages.has(childType)) {
          type = childType
          break
        }
        if (parts.length === 0) {
          break
        }
        parts.splice(parts.length - 2, 1)
      }
      if (type === 'Buffer') {
        hasBuffer = true
      }
      if (field.repeated) {
        type = `Array<${type}>`
      }
      if (!field.required) {
        type = `?: ${type}`
      } else {
        type = `: ${type}`
      }
      return type
    }
    if (fields.length > 0) {
      base = `{
${fields.map(field => {
  const type = toType(field)
  return `      ${field.name}${type}`
}).join('\n')}
    }`
    }
    const types = []
    for (const fields of Object.values(oneOfs)) {
      types.push(`(${fields.map(field => `{
      ${field.name}${toType(field)}
    }`).join(' | ')})`)
    }
    let data
    if (types.length === 0) {
      data = `
    interface ${name} ${base}`
    } else {
      types.unshift(base)
      data = `
    type ${name} = ${types.join(' & ')}`
    }
    let type = `Codec<def.${name}>`
    const extraTypes = []
      .concat(message.enums.map(e => `
    ${e.name}: def.${name}_${e.name}`))
      .concat(message.messages.map(e => `
    ${e.name}: Codec<def.${name}_${e.name}>`))
    if (extraTypes.length > 0) {
      type = `${type} & {${extraTypes.join('')}
  }`
    }
    exportedTypes.push({
      name,
      type: prefix === '' ? type : null,
      data
    })
  }
  for (const message of schema.messages) {
    addMessage(message)
  }
  return `/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable @typescript-eslint/consistent-type-definitions */
/* eslint-disable @typescript-eslint/naming-convention */${hasBuffer ? `
import { Buffer } from 'buffer'` : ''}
interface Codec <T> {
  buffer: true
  encodingLength: (input: T) => number
  encode: (input: T, buffer?: Buffer, offset?: number) => Buffer
  decode: (input: Buffer, offset?: number, end?: number) => T
}${enums.size > 0 ? `
type Values <T> = T extends { [key: string]: infer U } ? U : never` : ''}
declare namespace ${name} {
  namespace def {${exportedTypes.filter(type => type.data).map(({ data }) => data).join('')}
  }${exportedTypes.filter(type => type.type).map(({ name, type }) => `
  const ${name}: ${type}`).join('')}
}
export = ${name}
`
}

module.exports = {
  fromSchema
}
