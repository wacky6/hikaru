// global options parser

module.exports = {
    global: yargs => yargs
        .option('C', {
            alias: 'config',
            demandOption: true,
            describe: 'hikaru configuration file',
            type: 'string',
            default: '~/.hikaru/hikaru.rc.conf'
        })
    ,
    output: yargs => yargs
        .option('o', {
            alias: 'output',
            describe: 'output file pattern, use - for stdout',
            default: '@idol_@date_@time.@ext'
        })
}