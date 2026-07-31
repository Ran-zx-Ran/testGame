param(
    # 可选的局域网 IPv4 地址；未传入时使用默认路由对应的地址。
    [string]$IpAddress
)

# 任一步骤失败时立即停止，避免留下不完整证书。
$ErrorActionPreference = 'Stop'

# 获取项目根目录。
$projectRoot = Split-Path -Parent $PSScriptRoot
# 保存本地私钥和证书的目录。
$certificateDirectory = Join-Path $projectRoot '.certs'
# HTTPS 服务读取的 PFX 文件。
$pfxPath = Join-Path $certificateDirectory 'dev-cert.pfx'
# iPhone 需要安装的公开根证书文件。
$caCertificatePath = Join-Path $certificateDirectory 'local-dev-ca.cer'
# Vite 配置读取的局域网地址文件。
$lanIpPath = Join-Path $certificateDirectory 'lan-ip.txt'
# 与 Vite HTTPS 配置保持一致的 PFX 开发口令。
$pfxPassphrase = 'motion-arcade-local'

# 解析显式地址，或从默认网络路由中确定局域网 IPv4 地址。
function Get-LanIpAddress {
    param(
        # 用户显式指定的候选地址。
        [string]$RequestedAddress
    )

    if ($RequestedAddress) {
        # 校验后使用的显式 IP 地址对象。
        $parsedAddress = $null
        if (-not [System.Net.IPAddress]::TryParse($RequestedAddress, [ref]$parsedAddress) -or
            $parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
            throw "无效的 IPv4 地址：$RequestedAddress"
        }
        return $parsedAddress.ToString()
    }

    # UDP 套接字只用于让系统选择默认路由，不会发送应用数据。
    $routeProbe = [System.Net.Sockets.UdpClient]::new()
    try {
        $routeProbe.Connect('1.1.1.1', 65530)
        # 默认路由对应的本机网络端点。
        $localEndpoint = [System.Net.IPEndPoint]$routeProbe.Client.LocalEndPoint
        if ($localEndpoint.Address -and -not $localEndpoint.Address.Equals([System.Net.IPAddress]::Loopback)) {
            return $localEndpoint.Address.ToString()
        }
    }
    catch {
        # 无外网路由时继续从已启用网卡中查找地址。
    }
    finally {
        $routeProbe.Dispose()
    }

    # 已启用网卡上的首个可用局域网 IPv4 地址。
    $fallbackAddress = Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred |
        Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
        Select-Object -First 1 -ExpandProperty IPAddress
    if (-not $fallbackAddress) {
        throw '未找到可用的局域网 IPv4 地址，请通过 -IpAddress 手动指定。'
    }
    return $fallbackAddress
}

# 证书中写入的当前局域网地址。
$lanIp = Get-LanIpAddress -RequestedAddress $IpAddress
New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null

# 根证书使用的 RSA 私钥。
$caKey = [System.Security.Cryptography.RSA]::Create(3072)
# 本地根证书签名请求。
$caRequest = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
    'CN=Motion Arcade Local Development CA',
    $caKey,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256,
    [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
)
# 根证书允许的密钥用途。
$caKeyUsage = [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign -bor
    [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::CrlSign
[void]$caRequest.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true, $false, 0, $true)
)
[void]$caRequest.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new($caKeyUsage, $true)
)
[void]$caRequest.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new($caRequest.PublicKey, $false)
)
# 允许少量设备时钟误差的证书起始时间。
$notBefore = [System.DateTimeOffset]::UtcNow.AddMinutes(-5)
# 有效十年的本地根证书。
$caCertificate = $caRequest.CreateSelfSigned($notBefore, $notBefore.AddYears(10))

# HTTPS 服务器证书使用的独立 RSA 私钥。
$serverKey = [System.Security.Cryptography.RSA]::Create(2048)
# 由本地根证书签发的服务器证书请求。
$serverRequest = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
    "CN=$lanIp",
    $serverKey,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256,
    [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
)
[void]$serverRequest.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true)
)
# 服务器证书允许的密钥用途。
$serverKeyUsage = [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor
    [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment
[void]$serverRequest.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new($serverKeyUsage, $true)
)
# HTTPS 服务器身份验证用途集合。
$enhancedKeyUsages = [System.Security.Cryptography.OidCollection]::new()
[void]$enhancedKeyUsages.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
[void]$serverRequest.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($enhancedKeyUsages, $false)
)
# 覆盖局域网地址和本机开发地址的 SAN 扩展。
$subjectAlternativeNames = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$subjectAlternativeNames.AddDnsName('localhost')
$subjectAlternativeNames.AddIpAddress([System.Net.IPAddress]::Parse($lanIp))
$subjectAlternativeNames.AddIpAddress([System.Net.IPAddress]::Loopback)
$subjectAlternativeNames.AddIpAddress([System.Net.IPAddress]::IPv6Loopback)
[void]$serverRequest.CertificateExtensions.Add($subjectAlternativeNames.Build())

# 服务器证书的随机序列号。
$serialNumber = [byte[]]::new(16)
# 生成序列号使用的安全随机数生成器。
$randomNumberGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$randomNumberGenerator.GetBytes($serialNumber)
$randomNumberGenerator.Dispose()
$serialNumber[0] = $serialNumber[0] -band 0x7F
# 由本地根证书签发、有效一年的服务器证书。
$issuedCertificate = $serverRequest.Create($caCertificate, $notBefore, $notBefore.AddYears(1), $serialNumber)
# 附加服务器私钥后的完整服务器证书。
$serverCertificate = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::CopyWithPrivateKey(
    $issuedCertificate,
    $serverKey
)
# 仅导出服务器证书；根证书单独交给 iPhone 安装，避免服务端误选根证书作为站点证书。
$pfxBytes = $serverCertificate.Export(
    [System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx,
    $pfxPassphrase
)
# 导出的公开根证书二进制内容。
$caBytes = $caCertificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
[System.IO.File]::WriteAllBytes($pfxPath, $pfxBytes)
[System.IO.File]::WriteAllBytes($caCertificatePath, $caBytes)
[System.IO.File]::WriteAllText($lanIpPath, $lanIp, [System.Text.UTF8Encoding]::new($false))

$serverCertificate.Dispose()
$issuedCertificate.Dispose()
$serverKey.Dispose()
$caCertificate.Dispose()
$caKey.Dispose()

Write-Host "局域网 HTTPS 证书已生成：$lanIp"
Write-Host '下一步运行 pnpm dev:https，并按终端中的地址在 iPhone 上安装证书和打开游戏。'
