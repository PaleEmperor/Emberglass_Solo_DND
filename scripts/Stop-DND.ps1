$ports = @(5173, 8787, 7860)
foreach ($port in $ports) {
  $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    try {
      Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
      Write-Host "Stopped process on port $port."
    } catch {}
  }
}
Write-Host "Emberglass local app processes stopped."
