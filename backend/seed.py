
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Material, Supplier


def seed():
    with SessionLocal() as db:
        supplier = db.scalar(
            select(Supplier).where(
                Supplier.name == "Demo Yarn Supplier"
            )
        )

        if supplier is None:
            supplier = Supplier(
                name="Demo Yarn Supplier",
                contact="9876500000",
                email="supplier@example.com",
            )
            db.add(supplier)
            db.flush()

        material = db.scalar(
            select(Material).where(
                Material.material_type == "Cotton",
                Material.colour == "Blue",
                Material.specification == "30s combed cotton",
            )
        )

        if material is None:
            material = Material(
                material_type="Cotton",
                colour="Blue",
                specification="30s combed cotton",
                reorder_threshold_kg=20,
                yarn_kg_per_metre=0.15,
            )
            db.add(material)

        db.commit()
        print(f"Supplier ID: {supplier.id}")
        print(f"Material ID: {material.id}")


if __name__ == "__main__":
    seed()
