// global options parser

module.exports = {
    global: yargs => yargs
    ,
    output: yargs => yargs
        .option('O', {
            alias: 'output-dir',
            describe: 'output directory',
            default: '~/hikaru/',
        })
        .option('o', {
            alias: 'output',
            describe: 'output file pattern, use - for stdout',
            default: '@idol_@date_@time.@ext'
        })
}