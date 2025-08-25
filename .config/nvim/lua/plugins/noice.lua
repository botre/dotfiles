return {
    "folke/noice.nvim",
    event = "VeryLazy",
    opts = {},
    dependencies = {
        "MunifTanjim/nui.nvim",
    },
    config = function()
        require("noice").setup({
            presets = {
                bottom_search = true,
                command_palette = true,
                inc_rename = false,
                long_message_to_split = true,
                lsp_doc_border = false,
            },
        })
    end,
}
