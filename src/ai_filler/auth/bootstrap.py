"""Create the initial super-admin account from a local interactive prompt."""

from getpass import getpass

from .service import create_super_admin


def main() -> None:
    identifier = input("Initial super-admin ID: ").strip()
    password = getpass("Initial super-admin password: ")
    confirmation = getpass("Confirm password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    try:
        identity = create_super_admin(identifier=identifier, password=password)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    print(f"Created initial super-admin account: {identity['admin_id']}")


if __name__ == "__main__":
    main()
