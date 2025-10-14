return {
    {
        'saghen/blink.cmp',
        dependencies = {
            'rafamadriz/friendly-snippets',
            'fang2hou/blink-copilot',
        },
        version = '1.*',
        opts = {
            keymap = { preset = 'default' },
            appearance = {
                nerd_font_variant = 'mono'
            },
            completion = {
                list = {
                    selection = { auto_insert = false }
                },
                documentation = { auto_show = true }
            },
            sources = {
                default = { 'lsp', 'path', 'snippets', 'buffer', 'copilot' },
                providers = {
                    copilot = {
                        name = 'copilot',
                        module = 'blink-copilot',
                        score_offset = 100,
                        async = true,
                    },
                },
            },
            fuzzy = { implementation = "prefer_rust_with_warning" }
        },
        opts_extend = { "sources.default" }
    },
}
