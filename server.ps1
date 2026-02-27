[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8090/')
$listener.Start()
Write-Host "Server started on http://localhost:8090/"

$rootDir = (Get-Location).Path

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $urlPath = $ctx.Request.Url.LocalPath
    if ($urlPath -eq '/') { $urlPath = '/index.html' }
    
    $relativePath = $urlPath.TrimStart('/').Replace('/', '\')
    $filePath = [System.IO.Path]::Combine($rootDir, $relativePath)
    Write-Host "Request: $urlPath -> $filePath"
    
    $response = $ctx.Response
    
    if ([System.IO.File]::Exists($filePath)) {
        $content = [System.IO.File]::ReadAllBytes($filePath)
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $contentType = switch ($ext) {
            '.html' { 'text/html; charset=utf-8' }
            '.css' { 'text/css; charset=utf-8' }
            '.js' { 'application/javascript; charset=utf-8' }
            '.png' { 'image/png' }
            '.jpg' { 'image/jpeg' }
            '.svg' { 'image/svg+xml' }
            '.json' { 'application/json' }
            '.webp' { 'image/webp' }
            '.ico' { 'image/x-icon' }
            default { 'application/octet-stream' }
        }
        $response.ContentType = $contentType
        $response.ContentLength64 = $content.Length
        $response.OutputStream.Write($content, 0, $content.Length)
        Write-Host "  -> 200 OK ($($content.Length) bytes)"
    }
    else {
        $response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("Not found: $urlPath (looked at: $filePath)")
        $response.ContentLength64 = $msg.Length
        $response.OutputStream.Write($msg, 0, $msg.Length)
        Write-Host "  -> 404 Not Found"
    }
    
    $response.Close()
}
