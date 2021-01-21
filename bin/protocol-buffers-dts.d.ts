declare namespace bin {
  interface Options {
    help: boolean
    watch: boolean
    output: string | undefined
    file: string | undefined
  }
  function argv (argv: string[]): Options
  function start (opts: Options): Promise<number>
}
export = bin
