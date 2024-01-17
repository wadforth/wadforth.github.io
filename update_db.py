import time
import requests
from requests.auth import HTTPBasicAuth
import os
import platform
import csv
import traceback
from tqdm import tqdm
from colorama import init, Fore, Style
from bs4 import BeautifulSoup
import subprocess
import re
import sys
from country_codes import COUNTRY_CODE_MAPPING

ABUSEIPDB_API_KEY = "8ebb506206467aa74fda22ad88de3aaf906597ef9a1d54c18005b1732f9391a2e905eb61068d10ba"
TEXT_FILE = "ip_data.txt"

GITHUB_REPO_OWNER = "wadforth"
GITHUB_REPO_NAME = "wadforth.github.io"
TEXT_FILE_GITHUB_PATH = "ip_data.txt"

ip_info = {}

# Define color codes based on the platform
if platform.system() == 'Windows':
    RED = Fore.RED
    YELLOW = Fore.YELLOW
    GREEN = Fore.GREEN
    CYAN = Fore.CYAN
    RESET = Style.RESET_ALL
else:
    RED = '\033[91m'
    YELLOW = '\033[93m'
    GREEN = '\033[92m'
    RESET = '\033[0m'

# Function to clear the console screen
def clear_screen():
    if os.name == 'nt':  # For Windows
        os.system('cls')
    else:  # For Linux and macOS
        os.system('clear')

# Function to download text file from GitHub
def download_text_from_github():
    text_raw_url = f"https://raw.githubusercontent.com/{GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}/main/{TEXT_FILE_GITHUB_PATH}"
    auth = HTTPBasicAuth("wadforth", "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")

    # Remove existing text file if present
    if os.path.exists(TEXT_FILE):
        os.remove(TEXT_FILE)

    try:
        response = requests.get(text_raw_url, auth=auth)
        response.raise_for_status()

        # Save the file
        with open(TEXT_FILE, "w") as file:
            file.write(response.text)

        print(GREEN + "SUCCESS" + RESET + f": Text file downloaded successfully from {text_raw_url}")
        print(f"Saved to: {os.path.abspath(TEXT_FILE)}")

        return TEXT_FILE

    except requests.exceptions.RequestException as e:
        print(f"{RED}ERROR{RESET}: Error downloading text file: {e}")
        return None

# Function to print a summary of appended information
def print_summary(ip_info, skipped_ips):
    print("\nSummary of Appended Information:")
    appended_count = 0
    skipped_count = 0

    for ip, info in ip_info.items():
        abuse_confidence = info.get('abuseConfidenceScore', 0)
        whitelisted = info.get('isWhitelisted', False)

        if abuse_confidence >= 70:
            confidence_color = RED
        elif 30 <= abuse_confidence <= 69:
            confidence_color = YELLOW
        else:
            confidence_color = GREEN

        print("\nIP Address:", ip)
        print(f"AbuseConfidence: {confidence_color}{abuse_confidence}{RESET}")
        print(f"Whitelisted: {GREEN}{whitelisted}{RESET}")
        print("\n" + "-"*50)

        # Update counts
        appended_count += 1

    print("\nSummary of Skipped IPs:")
    for skipped_ip in skipped_ips:
        print(f"\n[SKIPPED] IP Address: {skipped_ip['ip']}")
        print(f"ISP: {skipped_ip['isp']}")
        print(f"Country: {skipped_ip['country']}")
        skipped_count += 1

    print("\nSummary:")
    print(f"Total IPs Appended: {appended_count}")
    print(f"Total IPs Skipped: {skipped_count}")

import re

def read_ip_addresses():
    while True:
        file_path = input("Enter the path to the text file containing IP addresses: ").strip('"')

        try:
            with open(file_path, "r") as file:
                # Extract valid IP addresses using regular expression
                ip_addresses = re.findall(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', file.read())

                if ip_addresses:
                    return ip_addresses
                else:
                    print(f"{RED}ERROR{RESET}: No valid IP addresses found in the file.")
        except FileNotFoundError:
            print(f"{RED}ERROR{RESET}: File not found at {file_path}")
        except Exception as e:
            print(f"{RED}ERROR{RESET}: Error reading file: {e}")


from datetime import datetime

def update_text_file(file_path, ip_info):
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with open(file_path, mode='a', encoding='utf-8') as text_file:
        # Write new data at the end of the file
        for ip, info in ip_info.items():
            values = f"{current_time},{ip}," + ",".join(str(info[prop]) for prop in info)
            text_file.write(values + "\n")

def print_success(ip, abuse_confidence, country_code, total_reports):
    confidence_color = (
        Fore.RED if abuse_confidence >= 70 else
        Fore.YELLOW if 30 <= abuse_confidence <= 69 else
        Fore.GREEN
    )

    country_code_color = Fore.CYAN
    total_reports_color = Fore.MAGENTA

    print(
        f"\033[F"  # Move the cursor up one line
        f"[{confidence_color}SUCCESS{Style.RESET_ALL}] "
        f"IP Address: {ip} - "
        f"AbuseConfidence: {confidence_color}{abuse_confidence}{Style.RESET_ALL}% - "
        f"Country Code: {country_code_color}{country_code}{Style.RESET_ALL} - "
        f"Total Reports: {total_reports_color}{total_reports}{Style.RESET_ALL}"
    )

def git_pull_allow_unrelated_histories():
    try:
        subprocess.run(["git", "pull", "--allow-unrelated-histories", "origin", "main"])
        print("Git pull successful.")
    except Exception as e:
        print(f"Error during git pull: {e}")

def git_push_text_file(text_file):
    try:
        # Add and commit the text file
        os.system(f'git add "{text_file}"')
        os.system(f'git commit -m "Update text file: {text_file}"')

        # Pull changes before pushing
        os.system(f"git pull origin main")

        # Force push changes to the remote repository
        os.system(f"git push origin main --force")

        print("Text file pushed successfully.")
    except Exception as e:
        print(f"Error pushing text file: {e}")


# Define the print_progress function with the correct parameters
# Define the print_progress function with carriage return
def print_progress(iteration, total, progress_bar, prefix='', suffix='', decimals=1, length=100, fill='█'):
    percent = ("{0:.1f}").format(100 * (iteration / float(total)))
    filled_length = int(length * iteration // total)
    bar = fill * filled_length + '-' * (length - filled_length)
    print(f'\r{prefix} |{bar}| {percent}% {suffix}', end='', flush=True)
        

# Function to get country name from country code
def get_country_name(country_code):
    return COUNTRY_CODE_MAPPING.get(country_code, "Not available")

    
def perform_api_lookup(ip_address):
    url = f"https://api.abuseipdb.com/api/v2/check?ipAddress={ip_address}"
    headers = {"Accept": "application/json", "Key": ABUSEIPDB_API_KEY}
    timeout = 10  # Set the timeout value in seconds

    try:
        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()
        data = response.json()

        if "data" in data:
            info = {
                "ipAddress": data["data"].get("ipAddress", ""),
                "isPublic": data["data"].get("isPublic", ""),
                "ipVersion": data["data"].get("ipVersion", ""),
                "isWhitelisted": data["data"].get("isWhitelisted", ""),
                "abuseConfidenceScore": data["data"].get("abuseConfidenceScore", ""),
                "countryCode": data["data"].get("countryCode", ""),
                "countryName": data["data"].get("countryName", "Not available"),
                "usageType": data["data"].get("usageType", ""),
                "isp": data["data"].get("isp", ""),
                "domain": data["data"].get("domain", ""),
                "hostnames": data["data"].get("hostnames", []),
                "isTor": data["data"].get("isTor", ""),
                "totalReports": data["data"].get("totalReports", ""),
                "numDistinctUsers": data["data"].get("numDistinctUsers", ""),
                "lastReportedAt": data["data"].get("lastReportedAt", ""),
            }

            if info["countryName"] == "Not available":
                country_name = get_country_name(info["countryCode"])
                info["countryName"] = country_name if country_name else "Not available"

        return info

    except requests.exceptions.Timeout as timeout_err:
        print(f"{ip_address} - {RED}Timeout error occurred: {timeout_err}{RESET}")
        # Perform push to GitHub or handle as needed
        git_push_text_file(TEXT_FILE)
        sys.exit(1)  # Exit the script after handling the error

    except requests.exceptions.RequestException as req_err:
        print(f"{ip_address} - {RED}Request error occurred: {req_err}{RESET}")
        # Perform push to GitHub or handle as needed
        git_push_text_file(TEXT_FILE)
        sys.exit(1)  # Exit the script after handling the error

    except Exception as e:
        print(f"{ip_address} - {RED}An unexpected error occurred: {e}{RESET}")

    return None

# Modify the main function to correctly initialize the progress_bar_lookup
def main():
    try:
        # Download text file from GitHub
        text_filename = download_text_from_github()
        success = text_filename is not None

        if success:
            # Continue with the rest of your main function...
            ip_addresses = read_ip_addresses()
            ip_info = {}
            skipped_ips = []

            # Check against text file if IP already present
            existing_ips = set()
            with open(text_filename, 'r', encoding='utf-8') as text_file:
                lines = text_file.readlines()
                for i in range(1, len(lines)):
                    ip = lines[i].split(',')[0]
                    existing_ips.add(ip)

            total_ips = len(ip_addresses)

            # Correct placement of the progress bar initialization
            progress_bar_lookup = tqdm(total=total_ips, desc='IP Lookup', bar_format="{l_bar}%s{bar}%s{r_bar}" % (GREEN, RESET))

            for i, ip in enumerate(ip_addresses, start=1):
                try:
                    if ip in existing_ips:
                        skipped_ips.append({'ip': ip, 'isp': 'N/A', 'country': 'N/A'})
                        progress_bar_lookup.update(1)
                        continue

                    # Corrected placement of the print_progress call
                    print_progress(i, total_ips, progress_bar_lookup, suffix="Complete", length=50)

                    info = perform_api_lookup(ip)
                    if info:
                        ip_info[ip] = info

                        # Update progress bar
                        progress_bar_lookup.update(1)
                        tqdm.write(f"[{GREEN}SUCCESS{Style.RESET_ALL}] {ip} - AbuseConfidence: {RED if info['abuseConfidenceScore'] >= 70 else YELLOW if 30 <= info['abuseConfidenceScore'] <= 69 else GREEN}{info['abuseConfidenceScore']}{Style.RESET_ALL}% - Country Name: {CYAN}{info.get('countryName', 'N/A')}{Style.RESET_ALL} - Total Reports: {CYAN}{info.get('totalReports', 'N/A')}{Style.RESET_ALL}")

                    # Append data to the text file after each successful lookup
                    update_text_file(text_filename, {ip: info})

                except Exception as e:
                    print(f"{RED}ERROR{RESET}: An error occurred for IP {ip}. Error details: {e}")

            # Close IP lookup progress bar
            progress_bar_lookup.close()

            # Update skipped IPs with additional information
            for skipped_ip in skipped_ips:
                skipped_ip_info = perform_api_lookup(skipped_ip['ip'])
                if skipped_ip_info:
                    skipped_ip['isp'] = skipped_ip_info.get('isp', 'N/A')
                    skipped_ip['country'] = skipped_ip_info.get('countryName', 'N/A')

            print_summary(ip_info, skipped_ips)
            git_push_text_file(TEXT_FILE)

            print(GREEN + "SUCCESS" + RESET + ": Script execution completed.")
            input("Press Enter to exit.")

    except Exception as e:
        # Log the error traceback to a file
        error_log_filename = "error_log.txt"
        with open(error_log_filename, 'a') as error_log:
            error_log.write(f"\n\nError at {time.strftime('%Y-%m-%d %H:%M:%S')}:\n")
            traceback.print_exc(file=error_log)

        print(f"{RED}ERROR{RESET}: An error occurred. Please check the error log for details.")
        input("Press Enter to exit.")

    if not success:
        input("Press Enter to exit.")
        return

if __name__ == "__main__":
    clear_screen()
    time.sleep(1)
    main()