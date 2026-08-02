"""Development tooling that ships with the repo but is not part of the app.

Deliberately outside ``app`` so it is neither installed by the deployment nor
counted by the coverage gate, and outside ``tests`` so pytest does not try to
collect it.
"""
