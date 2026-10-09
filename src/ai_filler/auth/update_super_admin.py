"""Rotate the locally configured super-admin credentials."""

from getpass import getpass

from .service import update_super_admin_credentials


def main() -> None:
    identifier = input("New super-admin ID: ").strip()
    password = getpass("New super-admin password: ")
    confirmation = getpass("Confirm new password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    try:
        identity = update_super_admin_credentials(identifier=identifier, password=password)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    print(f"Updated super-admin credentials for ID: {identity['admin_id']}")


if __name__ == "__main__":
    main()
