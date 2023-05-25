for _, item in ipairs({
    { key = 'b', description = 'Browser', application = "com.microsoft.edgemac" },
    { key = 'c', description = 'Code editor', application = "com.jetbrains.intellij" },
    { key = 'f', description = 'Finder', application = "com.apple.finder" },
    { key = 'm', description = 'Music', application = "com.spotify.client" },
    { key = 't', description = 'Terminal', application = "org.alacritty" },
    { key = 'v', description = 'Tasks', application = "com.TickTick.task.mac" },
}) do
    print('Binding ' .. item.description .. ' to Hyper+' .. item.key)
end
