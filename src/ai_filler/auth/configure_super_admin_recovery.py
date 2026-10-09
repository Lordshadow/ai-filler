"""Set the recovery email for the existing super-admin account."""

from .service import set_super_admin_recovery_email


def main() -> None:
    email = input("Super-admin recovery email: ").strip()
    confirmation = input("Confirm recovery email: ").strip()
    if email.lower() != confirmation.lower():
        raise SystemExit("Email addresses do not match.")
    try:
        set_super_admin_recovery_email(email=email)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    print("Super-admin recovery email configured.")


if __name__ == "__main__":
    main()
