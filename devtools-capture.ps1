param(
    [int]$TimeoutSeconds = 15
)
$outFile = Join-Path $PSScriptRoot 'devtools-console.log'
if (Test-Path $outFile) { Remove-Item $outFile -Force }
try {
    $json = Invoke-RestMethod -Uri 'http://127.0.0.1:9222/json' -TimeoutSec 5
} catch {
    Write-Output "Failed to get /json: $($_.Exception.Message)"
    exit 1
}
if (-not $json -or $json.Count -eq 0) { Write-Output 'No DevTools targets'; exit 1 }
$ws = $json[0].webSocketDebuggerUrl
Write-Output "Connecting to $ws"
$cws = New-Object System.Net.WebSockets.ClientWebSocket
$uri = [Uri]$ws
$ct = [Threading.CancellationToken]::None
$cws.ConnectAsync($uri,$ct).Wait()
Write-Output 'Connected'
Add-Content -Path $outFile -Value ("Connected to $ws")
function SendMsg($id,$method,$params){
    $obj = @{ id = $id; method = $method }
    if ($params) { $obj.params = $params }
    $s = (ConvertTo-Json $obj -Compress)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($s)
    try {
        $seg = [System.ArraySegment[byte]]::new($bytes,0,$bytes.Length)
    } catch {
        try {
            $seg = New-Object 'System.ArraySegment[System.Byte]' ($bytes,0,$bytes.Length)
        } catch {
            $seg = New-Object 'System.ArraySegment[System.Byte]' ($bytes)
        }
    }
    $cws.SendAsync($seg,[System.Net.WebSockets.WebSocketMessageType]::Text,$true,$ct).Wait()
    Add-Content -Path $outFile -Value ("SENT: $s")
}
SendMsg 1 'Runtime.enable' $null
SendMsg 2 'Log.enable' $null
SendMsg 3 'Console.enable' $null
SendMsg 4 'Page.enable' $null
SendMsg 5 'Network.enable' $null
$recvBuf = New-Object byte[] 65536
try {
    $segR = [System.ArraySegment[byte]]::new($recvBuf,0,$recvBuf.Length)
} catch {
    try {
        $segR = New-Object 'System.ArraySegment[System.Byte]' ($recvBuf,0,$recvBuf.Length)
    } catch {
        $segR = New-Object 'System.ArraySegment[System.Byte]' ($recvBuf)
    }
}
$sw = [Diagnostics.Stopwatch]::StartNew()
Add-Content -Path $outFile -Value 'Start receiving...'
while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    try {
        $result = $cws.ReceiveAsync($segR,$ct)
        $result.Wait(5000)
        if ($result.IsCompleted -and $result.Result.Count -eq 0) { Start-Sleep -Milliseconds 200; continue }
        $count = $result.Result.Count
        $str = [System.Text.Encoding]::UTF8.GetString($recvBuf,0,$count)
        Add-Content -Path $outFile -Value ("RECV: $str")
        Write-Output ("RECV: $str")
    } catch {
        Write-Output ("Receive exception: $($_.Exception.Message)")
        Add-Content -Path $outFile -Value ("Receive exception: $($_.Exception.Message)")
        break
    }
}
$cws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,'bye',$ct).Wait()
Add-Content -Path $outFile -Value 'Closed'
Write-Output "Done, logs in $outFile"
