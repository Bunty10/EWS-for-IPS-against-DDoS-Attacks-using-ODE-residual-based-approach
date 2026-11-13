"""
Residual-based ODE EWS IPS — a DDoS Early Warning System / Intrusion Prevention System.

Benign traffic is modelled as the trajectory of a linear dynamical system fitted
from the data (a data-driven ODE). The engine scores network traffic second by
second using physics-informed (PINN + Laplace) residuals that measure how far each
second departs from that learned dynamic, and raises graded LOW/MED/HIGH early
warnings. `preprocessing.py` holds the shared feature pipeline and `service.py`
adds job/progress tracking so results stream to the dashboard as they are produced.
"""
