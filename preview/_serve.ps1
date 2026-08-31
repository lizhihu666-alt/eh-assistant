$root = (Resolve-Path "$PSScriptRoot\..").Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:8792/")
$listener.Start()
Write-Output "Serving $root on http://127.0.0.1:8792/"

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $request = $context.Request
  $response = $context.Response
  try {
    $relativePath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrEmpty($relativePath)) { $relativePath = "preview/popup-preview.html" }
    $fullPath = Join-Path $root $relativePath
    $fullPath = [System.IO.Path]::GetFullPath($fullPath)
    if (-not $fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      $response.StatusCode = 403
    } elseif (-not (Test-Path $fullPath -PathType Leaf)) {
      $response.StatusCode = 404
    } else {
      $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
      $contentType = $mimeTypes[$ext]
      if (-not $contentType) { $contentType = "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($fullPath)
      $response.ContentType = $contentType
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch {
    $response.StatusCode = 500
  } finally {
    $response.OutputStream.Close()
  }
}
