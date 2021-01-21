import { fromSchema } from './index.js'
import { parse } from 'protocol-buffers-schema'
import * as test from 'fresh-tape'
import * as bin from './bin/protocol-buffers-dts'
import { readFileSync, unlinkSync } from 'fs'
import * as example from './example'
import { Buffer } from 'buffer'

const indent = (prefix: string, str: string): string => str.split('\n').map(line => `${prefix}${line}`).join('\n')
const indentInput = (prefix: string, str: string): string => indent(prefix, str.slice(1, str.length - 1))

function schema ({ data, buffer, values }: { data: string, buffer?: boolean, values?: boolean }): string {
  return `/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable @typescript-eslint/consistent-type-definitions */
/* eslint-disable @typescript-eslint/naming-convention */${buffer === true ? `
import { Buffer } from 'buffer'` : ''}
interface Codec <T> {
  buffer: true
  encodingLength: (input: T) => number
  encode: (input: T, buffer?: Buffer, offset?: number) => Buffer
  decode: (input: Buffer, offset?: number, end?: number) => T
}${values === true ? `
type Values <T> = T extends { [key: string]: infer U } ? U : never` : ''}
declare namespace schema {
${indentInput('  ', data)}
}
export = schema
`
}
const testSchema = (t: test.Test, input: string, result: Parameters<typeof schema>[0]): void => {
  t.equals(fromSchema(parse(input)), schema(result))
}

const testProps = (t: test.Test, input: string, properties: string, opts?: Omit<Parameters<typeof schema>[0], 'data'>): void => {
  testSchema(t, `message Test { ${input} }`, {
    ...opts,
    data: `
namespace def {
  interface Test {
${indentInput('    ', properties)}
  }
}
const Test: Codec<def.Test>
`
  })
}

test('basic schema', t => {
  testSchema(t, 'message Test {}', {
    data: `
namespace def {
  interface Test {}
}
const Test: Codec<def.Test>
`
  })
  t.end()
})

test('string property', t => {
  testProps(t, 'string foo = 1;', `
foo?: string
`)
  t.end()
})

test('uint32 property', t => {
  testProps(t, 'uint32 foo = 1;', `
foo?: number
`)
  t.end()
})

test('bytes property', t => {
  testProps(t, 'bytes foo = 1;', `
foo?: Buffer
`, { buffer: true })
  t.end()
})

test('required string prop', t => {
  testProps(t, 'required string foo = 1;', `
foo: string
`)
  t.end()
})

test('bytes property', t => {
  testProps(t, 'bytes foo = 1;', `
foo?: Buffer
`, { buffer: true })
  t.end()
})

test('repeated string prop', t => {
  testProps(t, 'repeated string foo = 1;', `
foo?: Array<string>
`)
  t.end()
})

test('repeated required string prop', t => {
  testProps(t, 'repeated string foo = 1;', `
foo?: Array<string>
`)
  t.end()
})

test('enum', t => {
  testSchema(t, `
message Test {
  Corpus foo = 1;
  enum Corpus {
    NET = 1;
    WORLD = 2;
  }
}
`, {
    data: `
namespace def {
  type Test_Corpus = {
    NET: 1
    WORLD: 2
  }
  interface Test {
    foo?: Values<Test_Corpus>
  }
}
const Test: Codec<def.Test> & {
  Corpus: def.Test_Corpus
}
`,
    values: true
  })
  t.end()
})

test('root enum', t => {
  testSchema(t, `
enum Corpus {
  NET = 1;
  WORLD = 2;
}
message Test {
  Corpus foo = 1;
}
`, {
    data: `
namespace def {
  type Corpus = {
    NET: 1
    WORLD: 2
  }
  interface Test {
    foo?: Values<Corpus>
  }
}
const Corpus: def.Corpus
const Test: Codec<def.Test>
`,
    values: true
  })
  t.end()
})

test('oneof', t => {
  testSchema(t, `
message Test {
  string foo = 1;
  oneof test {
    string bar = 2;
    string baz = 3;
  }
}
`, {
    data: `
namespace def {
  type Test = {
    foo?: string
  } & ({
    bar?: string
  } | {
    baz?: string
  })
}
const Test: Codec<def.Test>
`
  })
  t.end()
})

test('message reference', t => {
  testSchema(t, `
message Test {
  Test2 foo = 1;
}
message Test2 {
  string foo = 1;
}
`, {
    data: `
namespace def {
  interface Test {
    foo?: Test2
  }
  interface Test2 {
    foo?: string
  }
}
const Test: Codec<def.Test>
const Test2: Codec<def.Test2>
`
  })
  t.end()
})

test('sub-message refernence', t => {
  testSchema(t, `
message Test {
  Test2 foo = 1;
  message Test2 {
    string foo = 1;
  }
}
`, {
    data: `
namespace def {
  interface Test_Test2 {
    foo?: string
  }
  interface Test {
    foo?: Test_Test2
  }
}
const Test: Codec<def.Test> & {
  Test2: Codec<def.Test_Test2>
}
`
  })
  t.end()
})

test('binary argv', t => {
  t.deepEquals(bin.argv([]), { help: true, watch: false, file: null, output: null })
  t.deepEquals(bin.argv(['file']), { help: true, watch: false, file: 'file', output: null })
  t.deepEquals(bin.argv(['file', '-o', 'out']), { help: false, watch: false, file: 'file', output: 'out' })
  t.deepEquals(bin.argv(['file', '--output', 'out']), { help: false, watch: false, file: 'file', output: 'out' })
  t.deepEquals(bin.argv(['file', '-o', 'out', '-w']), { help: false, watch: true, file: 'file', output: 'out' })
  t.deepEquals(bin.argv(['file', '-w', '-o', 'out']), { help: false, watch: true, file: 'file', output: 'out' })
  t.deepEquals(bin.argv(['-w', '-o', 'out', 'file']), { help: false, watch: true, file: 'file', output: 'out' })
  t.deepEquals(bin.argv(['-wo', 'out', 'file']), { help: false, watch: true, file: 'file', output: 'out' })
  t.deepEquals(bin.argv(['-wo', 'out', 'file', '-h']), { help: true, watch: true, file: 'file', output: 'out' })
  t.end()
})

test('binary execution', t => {
  const output = 'example.d.ts'
  unlinkSync(output)
  bin.start({ help: false, watch: false, file: 'example.proto', output })
    .then(
      result => {
        t.equals(result, 0, 'exit code = 0')
        t.equals(readFileSync(output, 'utf-8'), `/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable @typescript-eslint/consistent-type-definitions */
/* eslint-disable @typescript-eslint/naming-convention */
import { Buffer } from 'buffer'
interface Codec <T> {
  buffer: true
  encodingLength: (input: T) => number
  encode: (input: T, buffer?: Buffer, offset?: number) => Buffer
  decode: (input: Buffer, offset?: number, end?: number) => T
}
type Values <T> = T extends { [key: string]: infer U } ? U : never
declare namespace schema {
  namespace def {
    type Corpus = {
      A: 0
      B: 1
    }
    interface Test_Nested {
      thing?: Buffer
    }
    interface Test_Test3 {
      some?: number
    }
    type Test_Corpus = {
      UNIVERSAL: 0
      WEB: 1
      NET: 1
      IMAGES: 2
      LOCAL: 3
      NEWS: 4
      PRODUCTS: 5
      VIDEO: 6
    }
    type Test = {
      data2?: { [key: string]: number }
      hello: string
      corpus?: Array<Values<Test_Corpus>>
      foo?: Array<Buffer>
      bar?: Test2
      baz?: Test_Test3
    } & ({
      age?: number
    } | {
      year?: number
    }) & ({
      hula?: string
    } | {
      world?: number
    })
    interface Test2 {
      corpus?: Values<Corpus>
    }
  }
  const Corpus: def.Corpus
  const Map_string_uint32: Codec<{ [key: string]: number }>
  const Test: Codec<def.Test> & {
    Corpus: def.Test_Corpus
    Nested: Codec<def.Test_Nested>
    Test3: Codec<def.Test_Test3>
  }
  const Test2: Codec<def.Test2>
}
export = schema
`, 'example file output matches')
        t.end()
      },
      err => t.fail(err)
    )
})

test('example schema', t => {
  /* eslint-disable @typescript-eslint/consistent-type-assertions */
  interface Codec <T> {
    buffer: true
    encodingLength: (input: T) => number
    encode: (input: T, buffer?: Buffer, offset?: number) => Buffer
    decode: (input: Buffer, offset?: number, end?: number) => T
  }
  type Test = Codec<example.def.Test> & {
    Corpus: {
      UNIVERSAL: 0
      WEB: 1
      NET: 1
      IMAGES: 2
      LOCAL: 3
      NEWS: 4
      PRODUCTS: 5
      VIDEO: 6
    }
    Nested: Codec<example.def.Test_Nested>
    Test3: Codec<example.def.Test_Test3>
  }
  const copyCodec = <T> (codec: Codec<T>): Codec<T> => {
    t.equal(typeof codec.encode, 'function', 'encode function')
    t.equal(typeof codec.decode, 'function', 'decode function')
    t.equal(typeof codec.encodingLength, 'function', 'encodingLength function')
    return {
      buffer: true,
      encode: codec.encode,
      encodingLength: codec.encodingLength,
      decode: codec.decode
    }
  }
  const expected: typeof example = {
    Corpus: {
      A: 0,
      B: 1
    },
    Map_string_uint32: example.Map_string_uint32 as Codec<{ [key: string]: number }>,
    Test: {
      ...copyCodec(example.Test),
      Corpus: {
        IMAGES: 2,
        LOCAL: 3,
        NET: 1,
        NEWS: 4,
        PRODUCTS: 5,
        UNIVERSAL: 0,
        VIDEO: 6,
        WEB: 1
      },
      Nested: copyCodec(example.Test.Nested),
      Test3: copyCodec(example.Test.Test3)
    } as Test,
    Test2: copyCodec(example.Test2)
  }
  t.deepEquals(example, expected, 'output works')
  const defaults = {
    data2: {},
    age: 0,
    year: 0,
    hula: '',
    world: 0,
    corpus: [],
    foo: [],
    bar: null,
    baz: null
  }
  const deEncode = (code: example.def.Test): void => {
    const clean = (obj: any): any => {
      for (const key in obj) {
        const value = obj[key]
        if (value === undefined) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete obj[key]
        }
      }
      return obj
    }
    t.deepEquals(expected.Test.decode(expected.Test.encode(code)), clean({
      ...defaults,
      ...code
    }))
  }
  deEncode({ hello: 'world' })
  deEncode({ hello: 'world', age: 1, year: undefined })
  deEncode({
    hello: 'world',
    bar: {
      corpus: 1
    }
  })
  deEncode({
    hello: 'world',
    baz: {
      some: 3
    }
  })
  deEncode({
    hello: 'world',
    corpus: [4]
  })
  deEncode({
    hello: 'world',
    data2: { foo: 1, bar: 3 }
  })
  deEncode({
    hello: 'world',
    foo: [Buffer.from('abcd')]
  })
  deEncode({
    hello: 'world',
    year: 1,
    age: undefined
  })
  t.end()
})
