#!/bin/bash

# Fungsi Bar dengan Kotak Khas
get_bar() {
    local percent=${1%.*}
    [ -z "$percent" ] && percent=0
    local filled=$(( (percent * 10) / 100 ))
    [ $filled -gt 10 ] && filled=10
    local empty=$(( 10 - filled ))
    local bar=""
    for ((i=0; i<filled; i++)); do bar+="■"; done
    for ((i=0; i<empty; i++)); do bar+="□"; done
    echo "$bar"
}

# Status Emoji berdasarkan persen
get_status() {
    local pct=${1%.*}
    if [ "$pct" -ge 90 ]; then echo "🔴"
    elif [ "$pct" -ge 70 ]; then echo "🟡"
    else echo "🟢"; fi
}

# Info Dasar
os=$(grep -w PRETTY_NAME /etc/os-release | cut -d '"' -f2)
uptime_str=$(uptime -p | sed 's/up //')
load_avg=$(uptime | awk -F'load average:' '{print $2}' | xargs)
proc_count=$(ps aux --no-headers | wc -l)

# IP & Geo Info (dengan cache 1 jam agar update real-time tetap instan)
GEO_CACHE="/tmp/.vps_geo_cache"
if [ -f "$GEO_CACHE" ] && [ $(($(date +%s) - $(stat -c %Y "$GEO_CACHE" 2>/dev/null || echo 0))) -lt 3600 ]; then
    source "$GEO_CACHE" 2>/dev/null
fi

if [ -z "$ip_pub" ] || [ -z "$region_str" ] || [ "$ip_pub" = "N/A" ]; then
    ip_json=$(curl -s --max-time 3 ipinfo.io/json 2>/dev/null)
    if [ -n "$ip_json" ]; then
        ip_pub=$(echo "$ip_json" | grep -o '"ip": "[^"]*' | cut -d'"' -f4)
        isp_pub=$(echo "$ip_json" | grep -o '"org": "[^"]*' | cut -d'"' -f4 | cut -d' ' -f2-)
        region_pub=$(echo "$ip_json" | grep -o '"region": "[^"]*' | cut -d'"' -f4)
        country_pub=$(echo "$ip_json" | grep -o '"country": "[^"]*' | cut -d'"' -f4)
        city_pub=$(echo "$ip_json" | grep -o '"city": "[^"]*' | cut -d'"' -f4)
    fi

    if [ -z "$ip_pub" ] || [ -z "$region_pub" ]; then
        api_json=$(curl -s --max-time 3 "http://ip-api.com/json/?fields=query,regionName,city,countryCode,isp" 2>/dev/null)
        if [ -n "$api_json" ]; then
            [ -z "$ip_pub" ] && ip_pub=$(echo "$api_json" | grep -o '"query": "[^"]*' | cut -d'"' -f4)
            [ -z "$isp_pub" ] && isp_pub=$(echo "$api_json" | grep -o '"isp": "[^"]*' | cut -d'"' -f4)
            [ -z "$region_pub" ] && region_pub=$(echo "$api_json" | grep -o '"regionName": "[^"]*' | cut -d'"' -f4)
            [ -z "$country_pub" ] && country_pub=$(echo "$api_json" | grep -o '"countryCode": "[^"]*' | cut -d'"' -f4)
            [ -z "$city_pub" ] && city_pub=$(echo "$api_json" | grep -o '"city": "[^"]*' | cut -d'"' -f4)
        fi
    fi

    [ -z "$ip_pub" ] && ip_pub=$(curl -s --max-time 2 ifconfig.me 2>/dev/null || echo "N/A")
    [ -z "$isp_pub" ] && isp_pub="N/A"

    if [ -n "$city_pub" ] && [ -n "$region_pub" ] && [ "$city_pub" != "$region_pub" ]; then
        if [ -n "$country_pub" ]; then
            region_str="$city_pub, $region_pub ($country_pub)"
        else
            region_str="$city_pub, $region_pub"
        fi
    elif [ -n "$city_pub" ] && [ -n "$country_pub" ]; then
        region_str="$city_pub ($country_pub)"
    elif [ -n "$region_pub" ] && [ -n "$country_pub" ]; then
        region_str="$region_pub ($country_pub)"
    elif [ -n "$region_pub" ]; then
        region_str="$region_pub"
    else
        region_str="N/A"
    fi

    if [ "$ip_pub" != "N/A" ]; then
        cat > "$GEO_CACHE" 2>/dev/null <<CACHEOF
ip_pub="$ip_pub"
isp_pub="$isp_pub"
region_str="$region_str"
CACHEOF
    fi
fi

# Spesifikasi VPS (dengan cache agar update real-time tetap instan)
SPEC_CACHE="/tmp/.vps_spec_cache"
if [ -f "$SPEC_CACHE" ]; then
    source "$SPEC_CACHE" 2>/dev/null
fi

if [ -z "$cpu_model" ] || [ -z "$cpu_cores" ] || [ -z "$ram_spec" ]; then
    cpu_raw=$(grep -m1 "model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2 | xargs)
    [ -z "$cpu_raw" ] && cpu_raw=$(lscpu 2>/dev/null | awk -F: '/Model name/ {print $2}' | xargs)
    if echo "$cpu_raw" | grep -qi "virtual"; then
        cpu_model=$(echo "$cpu_raw" | sed -e 's/([A-Za-z]*)//g' -e 's/  */ /g' -e 's/@.*//' | xargs)
    else
        cpu_model=$(echo "$cpu_raw" | sed -e 's/([A-Za-z]*)//g' -e 's/  */ /g' -e 's/@.*//' -e 's/ Processor//' -e 's/Xeon CPU /Xeon /' -e 's/ CPU / /' | xargs)
    fi
    cpu_cores=$(nproc 2>/dev/null || grep -c "^processor" /proc/cpuinfo 2>/dev/null || echo "1")
    cpu_arch=$(uname -m)

    ram_spec=$(free -h 2>/dev/null | awk '/^Mem:/ {print $2}')
    [ -z "$ram_spec" ] && ram_spec=$(free -m | awk '/Mem:/ {printf "%.1f GB", $2/1024}')
    swap_spec=$(free -h 2>/dev/null | awk '/^Swap:/ {print $2}')
    if [ -z "$swap_spec" ] || [ "$swap_spec" = "0B" ] || [ "$swap_spec" = "0" ]; then
        swap_spec="None"
    fi

    disk_spec=$(df -h / 2>/dev/null | awk 'NR==2{print $2}')
    disk_fs=$(df -T / 2>/dev/null | awk 'NR==2{print $2}')
    [ -z "$disk_fs" ] && disk_fs="ext4"

    virt_type=$(systemd-detect-virt 2>/dev/null || echo "kvm")
    [ "$virt_type" = "none" ] && virt_type="Dedicated"
    virt_type=$(echo "$virt_type" | tr '[:lower:]' '[:upper:]')
    kernel_ver=$(uname -r | cut -d- -f1,2)

    cat > "$SPEC_CACHE" 2>/dev/null <<SPECEOF
cpu_model="$cpu_model"
cpu_cores="$cpu_cores"
cpu_arch="$cpu_arch"
ram_spec="$ram_spec"
swap_spec="$swap_spec"
disk_spec="$disk_spec"
disk_fs="$disk_fs"
virt_type="$virt_type"
kernel_ver="$kernel_ver"
SPECEOF
fi

# CPU
cpu_load=$(top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4}' | cut -d. -f1)
[ -z "$cpu_load" ] && cpu_load=0
cpu_bar=$(get_bar "$cpu_load")
cpu_status=$(get_status "$cpu_load")

# RAM
ram_total=$(free -m | awk '/Mem:/{print $2}')
ram_used=$(free -m | awk '/Mem:/{print $3}')
[ -z "$ram_total" ] || [ "$ram_total" -eq 0 ] && ram_total=1
ram_pct=$(( ram_used * 100 / ram_total ))
ram_bar=$(get_bar "$ram_pct")
ram_status=$(get_status "$ram_pct")

# DISK
disk_total=$(df -h / | awk 'NR==2{print $2}')
disk_used=$(df -h / | awk 'NR==2{print $3}')
disk_pct=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
disk_bar=$(get_bar "$disk_pct")
disk_status=$(get_status "$disk_pct")

# Network - deteksi interface utama otomatis (fallback eth0)
net_iface=$(ip route 2>/dev/null | awk '/^default/{print $5; exit}')
[ -z "$net_iface" ] && net_iface=$(ls /sys/class/net 2>/dev/null | grep -v lo | head -n1)
[ -z "$net_iface" ] && net_iface="eth0"

if [ -d "/sys/class/net/$net_iface" ]; then
    rx_total=$(cat /sys/class/net/$net_iface/statistics/rx_bytes)
    tx_total=$(cat /sys/class/net/$net_iface/statistics/tx_bytes)
    rx_total_gb=$(awk "BEGIN {printf \"%.2f\", $rx_total/1073741824}")
    tx_total_gb=$(awk "BEGIN {printf \"%.2f\", $tx_total/1073741824}")

    rx_b1=$rx_total
    tx_b1=$tx_total
    sleep 1
    rx_b2=$(cat /sys/class/net/$net_iface/statistics/rx_bytes)
    tx_b2=$(cat /sys/class/net/$net_iface/statistics/tx_bytes)

    rx_bps=$(( rx_b2 - rx_b1 ))
    tx_bps=$(( tx_b2 - tx_b1 ))
else
    rx_total_gb="0.00"; tx_total_gb="0.00"; rx_bps=0; tx_bps=0
fi

format_speed() {
    local bps=$1
    if [ "$bps" -ge 1048576 ]; then
        awk "BEGIN {printf \"%.2f MB/s\", $bps/1048576}"
    elif [ "$bps" -ge 1024 ]; then
        awk "BEGIN {printf \"%.1f KB/s\", $bps/1024}"
    else
        echo "${bps} B/s"
    fi
}

rx_spd=$(format_speed $rx_bps)
tx_spd=$(format_speed $tx_bps)

# TOP PROCESS (Dibersihkan path-nya & diformat rata kanan rapi)
top3=$(ps -eo comm,%cpu --sort=-%cpu | awk 'NR>1 && NR<=4 {
    cmd=$1
    # Jika nama berupa path (ada slash), ambil nama file-nya saja
    n = split(cmd, parts, "/")
    clean_cmd = parts[n]
    if (length(clean_cmd) > 13) {
        clean_cmd = substr(clean_cmd, 1, 10) "..."
    }
    printf " • %-14s➜ %5s%%\n", clean_cmd, $2
}')

# OUTPUT TAMPILAN ELEGAN
cat << ENDOUT
╔══════════════════════════╗
     🛰️  VPS VITAL MONITOR
╚══════════════════════════╝

📍 SYSTEM INFO
   OS      : $os
   IP      : $ip_pub
   Region  : $region_str
   ISP     : $isp_pub
   Uptime  : $uptime_str
   Load    : $load_avg
   Proses  : $proc_count aktif
────────────────────────────
⚙️ SPESIFIKASI VPS
   CPU     : $cpu_model
   Core    : $cpu_cores Core ($cpu_arch)
   RAM     : $ram_spec | Swap: $swap_spec
   Storage : $disk_spec ($disk_fs)
   Virt    : $virt_type
   Kernel  : $kernel_ver
────────────────────────────
📊 RESOURCE USAGE
$cpu_status CPU   [${cpu_bar}] ${cpu_load}%
$ram_status RAM   [${ram_bar}] ${ram_pct}% (${ram_used}/${ram_total} MB)
$disk_status DISK  [${disk_bar}] ${disk_pct}% (${disk_used}/${disk_total})
────────────────────────────
📶 NETWORK (${net_iface})
   📥 Download  : $rx_spd
   📤 Upload    : $tx_spd
   📦 Total RX  : ${rx_total_gb} GB
   📦 Total TX  : ${tx_total_gb} GB
────────────────────────────
🔥 TOP PROCESS
$top3
ENDOUT
